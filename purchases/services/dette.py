from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from sales.models import StatutPaiement

from ..models import Achat, PaiementFournisseur


# Dupliqué depuis sales.services.credit, sans abstraction commune en v1.
# Une différence assumée : montant_du est recalculé depuis les lignes
# (acompte + paiements) sous le verrou, jamais décrémenté, pour ne jamais
# pouvoir dériver de ce qui a réellement été versé.


def _total_paiements(achat):
    # Originaux et corrections confondus : une correction porte un écart.
    return achat.paiements.aggregate(total=Sum('montant'))['total'] or Decimal('0')


def _dette_initiale(achat):
    return achat.montant_total - achat.montant_paye


def _recalculer_dette(achat):
    """Recalcule montant_du et statut_paiement depuis l'acompte et les
    paiements enregistrés, puis les sauvegarde. À appeler sous le verrou
    de l'achat."""
    total_paiements = _total_paiements(achat)
    achat.montant_du = _dette_initiale(achat) - total_paiements
    if achat.montant_du == 0:
        achat.statut_paiement = StatutPaiement.PAYE
    elif achat.montant_paye + total_paiements > 0:
        achat.statut_paiement = StatutPaiement.PARTIEL
    else:
        achat.statut_paiement = StatutPaiement.EN_ATTENTE
    achat.save(update_fields=['montant_du', 'statut_paiement'])


@transaction.atomic
def enregistrer_paiement(achat, montant, utilisateur, mode_paiement=None):
    """Enregistre un paiement sur la dette d'un achat à crédit. Verrouille
    l'achat (select_for_update) et revalide sous le verrou : deux paiements
    concurrents ne doivent jamais faire passer montant_du en négatif."""
    achat = Achat.objects.select_for_update().get(pk=achat.pk)

    if achat.statut == 'ANNULE':
        raise ValidationError("Impossible de payer un achat annulé.")
    # Vérifié avant tout calcul : couvre aussi un achat créé par l'ancien
    # code pendant un déploiement (montant_paye vide, mais comptant).
    if achat.montant_du <= 0:
        raise ValidationError("Cet achat n'a pas de dette à payer.")
    if montant <= 0:
        raise ValidationError("Le montant du paiement doit être strictement positif.")
    if montant > achat.montant_du:
        raise ValidationError("Le montant du paiement dépasse le montant dû sur cet achat.")

    paiement = PaiementFournisseur.objects.create(
        achat=achat, montant=montant, enregistre_par=utilisateur, mode_paiement=mode_paiement
    )
    _recalculer_dette(achat)
    return paiement


@transaction.atomic
def corriger_paiement(paiement, nouveau_montant, motif, utilisateur):
    """Corrige un paiement sans jamais toucher à sa ligne : crée une ligne
    portant l'écart (append-only) et recalcule la dette de l'achat.

    `nouveau_montant` est le montant que ce paiement aurait dû avoir :
    l'écart est calculé par rapport à son montant EFFECTIF (original +
    corrections déjà faites), pour qu'une seconde correction reste juste.

    Retourne (correction, achat, total_paiements)."""
    if paiement.paiement_corrige_id is not None:
        raise ValidationError(
            "Cette ligne est déjà une correction : corrigez le paiement d'origine."
        )
    motif = (motif or '').strip()
    if not motif:
        raise ValidationError("Le motif de la correction est obligatoire.")
    if nouveau_montant < 0:
        raise ValidationError("Le nouveau montant ne peut pas être négatif.")

    # Même verrou que enregistrer_paiement() : sérialise toutes les
    # écritures de paiement/correction concurrentes sur cet achat.
    achat = Achat.objects.select_for_update().get(pk=paiement.achat_id)
    if achat.statut == 'ANNULE':
        raise ValidationError("Impossible de corriger un paiement d'un achat annulé.")

    montant_effectif = paiement.montant + (
        paiement.corrections.aggregate(total=Sum('montant'))['total'] or Decimal('0')
    )
    delta = nouveau_montant - montant_effectif
    if delta == 0:
        raise ValidationError("Le nouveau montant est identique au montant actuel de ce paiement.")

    # Bornes : 0 <= total des paiements <= dette initiale, c.-à-d.
    # 0 <= acompte + paiements <= montant_total.
    nouveau_total = _total_paiements(achat) + delta
    if nouveau_total < 0:
        raise ValidationError("Cette correction rendrait le total payé sur l'achat négatif.")
    if nouveau_total > _dette_initiale(achat):
        raise ValidationError("Cette correction ferait dépasser le montant dû sur cet achat.")

    correction = PaiementFournisseur.objects.create(
        achat=achat,
        montant=delta,
        enregistre_par=utilisateur,
        paiement_corrige=paiement,
        motif_correction=motif,
        # L'écart se compense dans le même mode que l'original : le journal
        # de caisse par mode reste juste après correction.
        mode_paiement=paiement.mode_paiement,
    )
    _recalculer_dette(achat)
    return correction, achat, nouveau_total
