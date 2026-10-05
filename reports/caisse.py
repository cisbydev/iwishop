"""Journal de caisse (lecture seule) : ce qui a réellement été encaissé et
décaissé sur une période, ventilé par mode de paiement quand il est connu.

Volontairement séparé de calculer_resume_financier (reports/views.py), dont
aucun chiffre ne change : le résumé raisonne en chiffre d'affaires (ventes à
crédit comprises en totalité), le journal en argent effectivement reçu.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsOwner
from expenses.models import Depense
from purchases.models import Achat, PaiementFournisseur
from sales.models import Remboursement, Vente
from tenants.mixins import BoutiqueScopedMixin
from .views import bornes_dates_rapport

PERIODE_MAX_JOURS = 31
ZERO = Decimal('0.00')


def _montant(valeur):
    return (valeur or ZERO).quantize(Decimal('0.01'))


def calculer_journal_caisse(boutique, date_debut, date_fin):
    """Entrées (ventes + remboursements de dettes, par mode), sorties
    (argent versé pour les achats, par mode, + dépenses) et solde de la
    période.

    - Encaissé d'une vente = montant_paye - monnaie_rendue : montant_net
      pour une vente comptant, l'acompte pour une vente à crédit.
    - Remboursements : par mode ; mode_paiement null = "non précisé"
      (remboursements antérieurs au champ, jamais supposés en espèces). Les
      corrections (montant négatif) portent le mode de leur original et se
      compensent donc dans le bon mode.
    - Achats : argent réellement versé. L'acompte (montant_paye) compte à
      la date de l'achat ; les paiements fournisseurs (corrections
      comprises) à leur propre date. Un achat comptant a montant_paye =
      montant_total : chiffres identiques à ceux d'avant les dettes
      fournisseurs. mode_paiement null = "non précisé" (achats antérieurs
      au champ, jamais supposés en espèces).
    - Paiements d'un achat annulé (option A, décidée le 2026-10-03) :
      comptés à leur date. L'annulation n'est possible que si leur total
      net vaut 0 (AchatViewSet.annuler), donc ils se compensent, et les
      périodes passées ne bougent plus. L'acompte d'un achat annulé, lui,
      disparaît du jour de l'achat (limite connue ci-dessous).
    - Remboursements d'une vente annulée (option B des ventes, décidée le
      2026-10-04) : comptés à leur date, comme les paiements d'un achat
      annulé. L'annulation n'est possible que si leur total net vaut 0
      (VenteViewSet.annuler), donc ils se compensent. L'acompte d'une vente
      annulée disparaît du jour de la vente (limite connue ci-dessous).
    - Dépenses : supposées payées comptant, sans mode (aucun champ
      mode_paiement) - le frontend l'indique à l'écran.
    - Découpage par journée : `__date` convertit dans TIME_ZONE (global,
      Africa/Bamako, UTC+0). Toutes les boutiques sont en UTC+0 à ce jour ;
      une boutique dans un autre fuseau exigerait un fuseau par boutique.
    - Ventes synchronisées en différé (PWA hors ligne) : comptées au jour de
      date_vente (synchronisation, trace d'audit officielle), pas de
      horodatage_client - leur nombre est remonté à titre d'information.

    LIMITE CONNUE : les annulations n'ont pas de date (pas de champ
    date_annulation sur Vente/Achat/Depense). Une vente de lundi annulée
    mardi disparaît du journal de lundi et mardi ne montre aucune sortie.
    Un champ date_annulation sera nécessaire avant toute vraie clôture de
    caisse (journal figé, comptage, écart)."""
    ventes = Vente.objects.filter(
        boutique=boutique, statut='VALIDEE', date_vente__date__range=[date_debut, date_fin],
    )
    encaisse_vente = ExpressionWrapper(
        F('montant_paye') - F('monnaie_rendue'), output_field=DecimalField(max_digits=12, decimal_places=2)
    )
    ventes_par_mode = {
        ligne['mode_paiement']: ligne['total']
        for ligne in ventes.values('mode_paiement').annotate(total=Sum(encaisse_vente))
    }

    # Pas de filtre sur le statut de la vente (cf. docstring) : comptés à
    # leur date, comme les paiements fournisseurs.
    remboursements = Remboursement.objects.filter(
        vente__boutique=boutique, date_remboursement__date__range=[date_debut, date_fin],
    )
    remboursements_par_mode = {
        ligne['mode_paiement']: ligne['total']
        for ligne in remboursements.values('mode_paiement').annotate(total=Sum('montant'))
    }
    # Nombre de lignes, corrections comprises : un remboursement annulé par
    # sa correction fait 0 en montant mais reste deux mouvements.
    nombre_remboursements = remboursements.count()

    codes_modes = [code for code, _ in Vente.MODES_PAIEMENT]
    modes = list(codes_modes)
    if remboursements_par_mode.get(None):
        modes.append(None)  # "Non précisé", seulement s'il y en a
    par_mode = []
    for mode in modes:
        montant_ventes = _montant(ventes_par_mode.get(mode))
        montant_remboursements = _montant(remboursements_par_mode.get(mode))
        par_mode.append({
            "mode_paiement": mode,
            "ventes": montant_ventes,
            "remboursements": montant_remboursements,
            "total": montant_ventes + montant_remboursements,
        })

    total_ventes = sum((ligne["ventes"] for ligne in par_mode), ZERO)
    total_remboursements = sum((ligne["remboursements"] for ligne in par_mode), ZERO)
    total_entrees = total_ventes + total_remboursements

    achats_periode = Achat.objects.filter(
        boutique=boutique, statut='VALIDE', date_achat__date__range=[date_debut, date_fin],
    )
    achats = achats_periode.aggregate(
        acomptes=Sum('montant_paye'),
        nombre=Count('id'),
        credit_obtenu=Sum(
            F('montant_total') - F('montant_paye'), output_field=DecimalField(max_digits=12, decimal_places=2)
        ),
        dette_restante=Sum('montant_du'),
    )
    acomptes_par_mode = {
        ligne['mode_paiement']: ligne['total']
        for ligne in achats_periode.values('mode_paiement').annotate(total=Sum('montant_paye'))
    }
    # Option A : pas de filtre sur le statut de l'achat (cf. docstring).
    paiements = PaiementFournisseur.objects.filter(
        achat__boutique=boutique, date_paiement__date__range=[date_debut, date_fin],
    )
    paiements_par_mode = {
        ligne['mode_paiement']: ligne['total']
        for ligne in paiements.values('mode_paiement').annotate(total=Sum('montant'))
    }
    # Nombre de lignes, corrections comprises (même principe que
    # nombre_remboursements).
    nombre_paiements_fournisseurs = paiements.count()

    modes_achats = list(codes_modes)
    if acomptes_par_mode.get(None) or paiements_par_mode.get(None):
        modes_achats.append(None)  # "Non précisé", seulement s'il y en a
    achats_par_mode = [
        {
            "mode_paiement": mode,
            "montant": _montant(acomptes_par_mode.get(mode)) + _montant(paiements_par_mode.get(mode)),
        }
        for mode in modes_achats
    ]
    # date_depense (date saisie par le commerçant), comme le résumé financier.
    depenses = Depense.objects.filter(
        boutique=boutique, statut='VALIDEE', date_depense__range=[date_debut, date_fin],
    ).aggregate(total=Sum('montant'), nombre=Count('id'))
    total_acomptes = _montant(achats['acomptes'])
    total_paiements_fournisseurs = _montant(sum(paiements_par_mode.values(), ZERO))
    total_achats = total_acomptes + total_paiements_fournisseurs
    total_depenses = _montant(depenses['total'])
    total_sorties = total_achats + total_depenses

    infos = ventes.aggregate(
        nombre=Count('id'),
        credit_accorde=Sum(
            F('montant_net') - F('montant_paye'),
            filter=Q(client_credit__isnull=False),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        credit_restant_du=Sum('montant_du', filter=Q(client_credit__isnull=False)),
    )
    ventes_en_differe = ventes.filter(creee_hors_ligne=True).count()

    return {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "entrees": {
            "par_mode": par_mode,
            "ventes": total_ventes,
            "remboursements": total_remboursements,
            "nombre_remboursements": nombre_remboursements,
            "total": total_entrees,
        },
        "sorties": {
            # Argent versé pour les achats : acomptes + paiements
            # fournisseurs (même clé qu'avant, cf. docstring).
            "achats": total_achats,
            "nombre_achats": achats['nombre'],
            "acomptes_achats": total_acomptes,
            "paiements_fournisseurs": total_paiements_fournisseurs,
            "nombre_paiements_fournisseurs": nombre_paiements_fournisseurs,
            "achats_par_mode": achats_par_mode,
            "depenses": total_depenses,
            "nombre_depenses": depenses['nombre'],
            "total": total_sorties,
        },
        # "Solde de la période", pas "caisse attendue" : aucun fond de caisse
        # initial n'est enregistré.
        "solde_periode": total_entrees - total_sorties,
        "informations": {
            "nombre_ventes": infos['nombre'],
            # Part des ventes à crédit de la période non payée au moment de la
            # vente (hors acompte), remboursements ultérieurs ignorés.
            "credit_accorde": _montant(infos['credit_accorde']),
            # Ce qui reste dû aujourd'hui sur ces mêmes ventes (montant_du
            # actuel, tenu à jour par sales/services/credit.py) : pas l'état
            # à la fin de la période.
            "credit_restant_du": _montant(infos['credit_restant_du']),
            "ventes_synchronisees_en_differe": ventes_en_differe,
            # D7, même logique que credit_accorde / credit_restant_du : part
            # des achats de la période non payée à l'achat, et ce qui en
            # reste dû aujourd'hui. La dette totale par fournisseur est dans
            # l'écran Fournisseurs.
            "credit_fournisseur_obtenu": _montant(achats['credit_obtenu']),
            "dette_fournisseurs_restante": _montant(achats['dette_restante']),
        },
    }


def bornes_journal_caisse(request):
    """Aujourd'hui (heure locale) par défaut ; sinon les deux bornes,
    ordonnées, sur au plus PERIODE_MAX_JOURS jours."""
    date_debut, date_fin = bornes_dates_rapport(request)
    if date_debut is None and date_fin is None:
        aujourdhui = timezone.localdate()
        return aujourdhui, aujourdhui
    if date_debut is None or date_fin is None:
        raise ValidationError({"detail": "Fournissez date_debut et date_fin, ou aucune des deux (aujourd'hui)."})
    if date_debut > date_fin:
        raise ValidationError({"detail": "date_debut doit précéder date_fin."})
    if date_fin - date_debut >= timedelta(days=PERIODE_MAX_JOURS):
        raise ValidationError({"detail": f"La période ne peut pas dépasser {PERIODE_MAX_JOURS} jours."})
    return date_debut, date_fin


class JournalCaisseView(BoutiqueScopedMixin, APIView):
    # v1 : propriétaire seul (décision produit 2026-09-27). Lecture seule :
    # pas de _verifier_acces(), comme ResumeFinancierView - consulter reste
    # possible boutique désactivée/abonnement expiré. Pas Premium.
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        date_debut, date_fin = bornes_journal_caisse(request)
        # boutique_nom : titre imprimé, même boutique effective que les chiffres.
        return Response({
            **calculer_journal_caisse(boutique, date_debut, date_fin),
            "boutique_nom": boutique.nom,
        })
