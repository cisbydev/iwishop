from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from tenants.mixins import BoutiqueScopedMixin
from inventory.models import MouvementStock
from .models import Vente
from .serializers import VenteSerializer

class VenteViewSet(
    BoutiqueScopedMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    # Une vente validée est un document comptable : une fois créée, elle ne
    # doit plus être modifiable ni supprimable (PUT/PATCH/DELETE
    # désactivés, même principe que MouvementStock). Pour corriger une
    # erreur, on l'annule via l'action `annuler`, qui restaure le stock par
    # une écriture inverse plutôt que de réécrire ou effacer l'historique.
    queryset = Vente.objects.all()
    serializer_class = VenteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['mode_paiement', 'client', 'date_vente', 'statut']

    def perform_create(self, serializer):
        # VenteSerializer.create() résout et assigne déjà `boutique` lui-même
        # (via self.context['request']) : ne pas le repasser ici, sinon
        # Vente.objects.create(boutique=..., **validated_data) reçoit deux fois
        # le même kwarg (BoutiqueScopedMixin.perform_create l'injecterait aussi).
        serializer.save()

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        # get_object() applique le scoping boutique (BoutiqueScopedMixin) :
        # impossible d'annuler la vente d'une autre boutique.
        vente_verifiee = self.get_object()

        with transaction.atomic():
            # Reverrouille la ligne dans la transaction pour empêcher un
            # double appel concurrent de passer la vérification de statut
            # avant que le premier n'ait committé (idempotence robuste).
            vente = Vente.objects.select_for_update().get(pk=vente_verifiee.pk)
            if vente.statut == 'ANNULEE':
                raise ValidationError("Cette vente est déjà annulée.")

            for ligne in vente.lignes.select_related('produit').all():
                unites_a_restaurer = int(ligne.quantite * ligne.facteur_conversion_applique)
                produit = ligne.produit
                produit.quantite_en_stock += unites_a_restaurer
                produit.save()
                MouvementStock.objects.create(
                    boutique=vente.boutique,
                    produit=produit,
                    type_mouvement='ENTREE',
                    quantite=unites_a_restaurer,
                    motif=f"Annulation Vente #{vente.numero}",
                )

            vente.statut = 'ANNULEE'
            vente.save(update_fields=['statut'])

        serializer = self.get_serializer(vente)
        return Response(serializer.data)
