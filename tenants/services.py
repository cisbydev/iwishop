from django.db import transaction
from django.utils import timezone

from .models import Abonnement, PaiementAbonnement


def confirmer_paiement(paiement_id):
    """Applique un paiement confirmé (statut PayDunya déjà vérifié comme
    'completed' via confirmer_facture) à l'abonnement de la boutique.

    Idempotent : un même paiement rejoué (webhook dupliqué) ne prolonge
    l'abonnement qu'une seule fois. Protégé par select_for_update contre une
    course entre deux appels concurrents du webhook.
    """
    with transaction.atomic():
        try:
            paiement = PaiementAbonnement.objects.select_for_update().get(pk=paiement_id)
        except PaiementAbonnement.DoesNotExist:
            return False

        if paiement.statut == 'CONFIRME':
            return False  # déjà appliqué, on ignore le doublon

        aujourdhui = timezone.localdate()
        duree = paiement.formule.duree_jours

        abonnement, cree = Abonnement.objects.select_for_update().get_or_create(
            boutique=paiement.boutique,
            defaults={
                'formule': paiement.formule,
                'date_debut': aujourdhui,
                'date_fin': aujourdhui + timezone.timedelta(days=duree),
                'statut': 'ACTIF',
                'reference_paiement': paiement.invoice_token,
            },
        )

        if not cree:
            if abonnement.date_fin >= aujourdhui:
                abonnement.date_fin = abonnement.date_fin + timezone.timedelta(days=duree)
            else:
                abonnement.date_debut = aujourdhui
                abonnement.date_fin = aujourdhui + timezone.timedelta(days=duree)
            abonnement.formule = paiement.formule
            abonnement.statut = 'ACTIF'
            abonnement.reference_paiement = paiement.invoice_token
            abonnement.save()

        paiement.statut = 'CONFIRME'
        paiement.save(update_fields=['statut'])

        return True
