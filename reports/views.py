from django.http import HttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from django.db.models.functions import Coalesce
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from accounts.permissions import IsOwner
from parametres.models import ParametresBoutique
from tenants.mixins import BoutiqueScopedMixin
from sales.models import LigneVente, Vente
from sales.utils import unites_reelles_expr
from purchases.models import Achat
from expenses.models import Depense


def calculer_resume_financier(boutique, date_debut, date_fin):
    """Calcule le résumé financier (CA, achats, dépenses, bénéfices) d'une
    boutique sur une période optionnelle. Extrait de ResumeFinancierView.get()
    pour être réutilisé par ResumeFinancierExportPDFView - un seul endroit à
    corriger si la logique de calcul change (même principe que le bénéfice
    historique figé, cf. sales.models.LigneVente.prix_achat_unitaire)."""
    # Les ventes annulées ne doivent plus compter dans le CA ni le
    # bénéfice (cf. VenteViewSet.annuler) ; benefice_brut hérite de ce
    # filtre via `vente__in=ventes_qs` plus bas.
    ventes_qs = Vente.objects.filter(boutique=boutique, statut='VALIDEE')
    # Les achats annulés ne doivent plus compter dans le total ni le
    # nombre d'achats (cf. AchatViewSet.annuler).
    achats_qs = Achat.objects.filter(boutique=boutique, statut='VALIDE')
    # Les dépenses annulées ne doivent plus compter dans le total ni le
    # bénéfice net (cf. DepenseViewSet.annuler, P2 point 15).
    depenses_qs = Depense.objects.filter(boutique=boutique, statut='VALIDEE')

    if date_debut and date_fin:
        ventes_qs = ventes_qs.filter(date_vente__date__range=[date_debut, date_fin])
        achats_qs = achats_qs.filter(date_achat__date__range=[date_debut, date_fin])
        depenses_qs = depenses_qs.filter(date_depense__range=[date_debut, date_fin])

    # Chiffre d'affaires total
    chiffre_affaires = ventes_qs.aggregate(total=Sum('montant_net'))['total'] or 0

    # Total des achats
    total_achats = achats_qs.aggregate(total=Sum('montant_total'))['total'] or 0

    # Total des dépenses
    total_depenses = depenses_qs.aggregate(total=Sum('montant'))['total'] or 0

    # --- Bénéfice brut, calculé directement en base de données ---
    # Convertit chaque ligne de vente en nombre d'unités réelles via le
    # facteur de conversion centralisé sur son unité de vente.
    unites_reelles = unites_reelles_expr()

    # Le coût d'achat HISTORIQUE (prix_achat_unitaire x unités réelles)
    # est figé au moment de la vente - jamais Produit.prix_achat courant,
    # qui change à chaque nouvel achat et déformerait rétroactivement le
    # bénéfice d'une vente déjà réalisée (bug P1 corrigé). Le repli sur
    # Produit.prix_achat via Coalesce ne s'applique qu'aux lignes créées
    # avant ce correctif (prix_achat_unitaire NULL, aucun coût
    # historique connu) - limite assumée et documentée, voir
    # sales.models.LigneVente.prix_achat_unitaire.
    cout_historique_expr = ExpressionWrapper(
        Coalesce(F('prix_achat_unitaire'), F('produit__prix_achat')) * unites_reelles,
        output_field=DecimalField(max_digits=14, decimal_places=2)
    )

    cout_historique_total = LigneVente.objects.filter(
        boutique=boutique,
        vente__in=ventes_qs
    ).aggregate(total=Sum(cout_historique_expr))['total'] or 0

    # Le CA est la somme des montants nets : une remise globale diminue
    # donc le bénéfice brut au même titre que le chiffre d'affaires.
    benefice_brut = chiffre_affaires - cout_historique_total

    # Bénéfice net = Bénéfice brut - Total des dépenses
    benefice_net = benefice_brut - total_depenses

    return {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "chiffre_affaires": chiffre_affaires,
        "total_achats": total_achats,
        "total_depenses": total_depenses,
        "benefice_brut": benefice_brut,
        "benefice_net": benefice_net,
        "nombre_ventes": ventes_qs.count(),
        "nombre_achats": achats_qs.count(),
        "nombre_depenses": depenses_qs.count(),
    }


class ResumeFinancierView(BoutiqueScopedMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Réutilise la même résolution de boutique effective (Vue Support
        # comprise) que les ViewSets scopés, au lieu de dupliquer cette
        # logique ici sans gestion propre de Boutique.DoesNotExist (P2
        # point 14 - Vue Support ad-hoc). Vue en lecture seule : pas
        # d'appel à _verifier_acces() ici - consulter ses rapports doit
        # rester possible boutique désactivée/abonnement expiré, seules
        # les écritures sont bloquées (cf. tenants.mixins.BoutiqueScopedMixin).
        boutique = self._boutique_effective()
        # Récupérer les filtres de date optionnels (?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD)
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')

        return Response(calculer_resume_financier(boutique, date_debut, date_fin))


class ResumeFinancierExportPDFView(BoutiqueScopedMixin, APIView):
    # Export réservé au propriétaire (même principe que VenteViewSet.annuler
    # - une écriture comptable... ici une extraction de données comptables
    # complètes, pas un simple affichage - P1 point 6, RBAC).
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')
        resultat = calculer_resume_financier(boutique, date_debut, date_fin)
        # get_or_create comme ParametresBoutiqueView.get_object() : une
        # boutique n'a pas forcément encore de ParametresBoutique créé
        # explicitement (default="FCFA" s'applique alors).
        parametres, _ = ParametresBoutique.objects.get_or_create(boutique=boutique)
        devise = parametres.devise

        response = HttpResponse(content_type='application/pdf')
        nom_fichier = f"resume-financier-{boutique.slug}-{timezone.localdate().isoformat()}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{nom_fichier}"'

        # pageCompression=0 : flux non compressé - permet aux tests de
        # vérifier le contenu textuel directement dans response.content
        # sans dépendance supplémentaire d'extraction PDF (pypdf, etc.).
        pdf = canvas.Canvas(response, pagesize=A4, pageCompression=0)
        largeur, hauteur = A4
        y = hauteur - 2 * cm

        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(2 * cm, y, f"Résumé financier — {boutique.nom}")
        y -= 1 * cm

        pdf.setFont("Helvetica", 10)
        if resultat['date_debut'] and resultat['date_fin']:
            periode = f"Période : du {resultat['date_debut']} au {resultat['date_fin']}"
        else:
            periode = "Période : toutes dates confondues"
        pdf.drawString(2 * cm, y, periode)
        y -= 1.2 * cm

        lignes = [
            ("Chiffre d'affaires", f"{resultat['chiffre_affaires']} {devise}"),
            ("Total des achats", f"{resultat['total_achats']} {devise}"),
            ("Total des dépenses", f"{resultat['total_depenses']} {devise}"),
            ("Bénéfice brut", f"{resultat['benefice_brut']} {devise}"),
            ("Bénéfice net", f"{resultat['benefice_net']} {devise}"),
            ("Nombre de ventes", resultat['nombre_ventes']),
            ("Nombre d'achats", resultat['nombre_achats']),
            ("Nombre de dépenses", resultat['nombre_depenses']),
        ]

        pdf.setFont("Helvetica", 12)
        for libelle, valeur in lignes:
            pdf.drawString(2 * cm, y, f"{libelle} : {valeur}")
            y -= 0.8 * cm

        pdf.showPage()
        pdf.save()
        return response
