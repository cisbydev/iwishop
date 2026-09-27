from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from parametres.services import devise_boutique

from ..models import Remboursement, StatutPaiement, Vente


@transaction.atomic
def enregistrer_remboursement(vente, montant, utilisateur):
    """Enregistre un remboursement sur une vente à crédit et recalcule sa
    dette. Verrouille la vente (select_for_update) pour revalider
    montant <= montant_du sous le verrou : deux remboursements concurrents
    sur la même vente ne doivent jamais faire passer montant_du en négatif
    (même principe que le verrouillage stock de VenteSerializer.create())."""
    vente = Vente.objects.select_for_update().get(pk=vente.pk)

    if montant <= 0:
        raise ValidationError("Le montant du remboursement doit être strictement positif.")
    if montant > vente.montant_du:
        raise ValidationError("Le montant du remboursement dépasse le montant dû sur cette vente.")

    remboursement = Remboursement.objects.create(
        vente=vente, montant=montant, enregistre_par=utilisateur
    )

    vente.montant_du -= montant
    if vente.montant_du <= 0:
        vente.montant_du = 0
        vente.statut_paiement = StatutPaiement.PAYE
    else:
        vente.statut_paiement = StatutPaiement.PARTIEL
    vente.save(update_fields=['montant_du', 'statut_paiement'])

    return remboursement


@transaction.atomic
def corriger_remboursement(remboursement, nouveau_montant, motif, utilisateur):
    """Corrige un remboursement sans jamais toucher à sa ligne : crée une
    nouvelle ligne portant l'écart (append-only, même principe que
    MouvementStock) et recalcule montant_du/statut_paiement de la vente,
    qui ne sont que des valeurs dérivées des remboursements.

    `nouveau_montant` est le montant que ce remboursement aurait dû avoir :
    l'écart est calculé par rapport à son montant EFFECTIF (original +
    corrections déjà faites), pour qu'une seconde correction du même
    remboursement reste juste.

    Retourne (correction, vente, total_rembourse)."""
    if remboursement.remboursement_corrige_id is not None:
        raise ValidationError(
            "Cette ligne est déjà une correction : corrigez le remboursement d'origine."
        )
    motif = (motif or '').strip()
    if not motif:
        raise ValidationError("Le motif de la correction est obligatoire.")
    if nouveau_montant < 0:
        raise ValidationError("Le nouveau montant ne peut pas être négatif.")

    # Même verrou que enregistrer_remboursement() : sérialise toutes les
    # écritures de remboursement/correction concurrentes sur cette vente.
    vente = Vente.objects.select_for_update().get(pk=remboursement.vente_id)
    if vente.statut == 'ANNULEE':
        raise ValidationError("Impossible de corriger un remboursement d'une vente annulée.")

    montant_effectif = remboursement.montant + (
        remboursement.corrections.aggregate(total=Sum('montant'))['total'] or Decimal('0')
    )
    delta = nouveau_montant - montant_effectif
    if delta == 0:
        raise ValidationError("Le nouveau montant est identique au montant actuel de ce remboursement.")

    # Bornes : le total remboursé reste dans [0, dette initiale], c.-à-d.
    # montant_du reste dans [0, dette initiale]. La dette initiale est ce
    # qui restait dû à la création de la vente (montant_net - acompte), et
    # non montant_total (avant remise, acompte inclus).
    dette_initiale = max(vente.montant_net - vente.montant_paye, Decimal('0'))
    total_rembourse = vente.remboursements.aggregate(total=Sum('montant'))['total'] or Decimal('0')
    nouveau_total = total_rembourse + delta
    nouveau_du = vente.montant_du - delta
    if nouveau_total < 0:
        raise ValidationError("Cette correction rendrait le total remboursé sur la vente négatif.")
    if nouveau_du < 0 or nouveau_total > dette_initiale:
        raise ValidationError("Cette correction ferait dépasser le montant dû sur cette vente.")

    correction = Remboursement.objects.create(
        vente=vente,
        montant=delta,
        enregistre_par=utilisateur,
        remboursement_corrige=remboursement,
        motif_correction=motif,
    )

    vente.montant_du = nouveau_du
    if vente.montant_du <= 0:
        vente.montant_du = 0
        vente.statut_paiement = StatutPaiement.PAYE
    elif vente.montant_paye > 0 or nouveau_total > 0:
        vente.statut_paiement = StatutPaiement.PARTIEL
    else:
        vente.statut_paiement = StatutPaiement.EN_ATTENTE
    vente.save(update_fields=['montant_du', 'statut_paiement'])

    return correction, vente, nouveau_total


def dette_totale_client(client):
    """Somme du montant_du sur toutes les ventes à crédit VALIDEE de ce
    client (une vente ANNULEE ne compte plus dans sa dette, même principe
    que dashboard/reports qui excluent toujours les ventes annulées)."""
    total = Vente.objects.filter(client_credit=client, statut='VALIDEE').aggregate(
        total=Sum('montant_du')
    )['total']
    return total or Decimal('0')


def avertissement_plafond_credit(vente):
    """Avertissement non bloquant (pas une ValidationError) si la dette
    totale du client, nouvelle vente comprise, dépasse son plafond de
    crédit - la vente reste créée, à charge du vendeur de décider."""
    client = vente.client_credit
    if client is None or client.plafond_credit is None:
        return None

    dette_totale = dette_totale_client(client)
    if dette_totale > client.plafond_credit:
        devise = devise_boutique(vente.boutique)
        return (
            f"Attention : la dette totale de {client.nom} ({dette_totale} {devise}) dépasse "
            f"son plafond de crédit ({client.plafond_credit} {devise})."
        )
    return None
