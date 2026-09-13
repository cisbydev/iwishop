from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

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
        return (
            f"Attention : la dette totale de {client.nom} ({dette_totale} FCFA) dépasse "
            f"son plafond de crédit ({client.plafond_credit} FCFA)."
        )
    return None
