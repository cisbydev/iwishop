from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from tenants.mixins import BoutiqueScopedMixin
from .models import MouvementStock
from .serializers import MouvementStockSerializer


class MouvementStockViewSet(
    BoutiqueScopedMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    # Un mouvement de stock est une écriture de journal : une fois créé, il
    # ne doit plus être modifié ni supprimé (aucun des deux ne recalcule
    # Produit.quantite_en_stock, ce qui désynchroniserait le stock réel de
    # son historique - cas encore plus grave pour AJUSTEMENT, qui stocke une
    # valeur absolue sans jamais garder l'état précédent). Pour corriger une
    # erreur, on crée un nouveau mouvement inverse plutôt que d'éditer
    # l'historique. Le frontend n'a jamais utilisé PUT/PATCH/DELETE ici.
    queryset = MouvementStock.objects.select_related('produit').all()
    serializer_class = MouvementStockSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['produit', 'type_mouvement']

    @transaction.atomic
    def perform_create(self, serializer):
        mouvement = serializer.save(boutique=self.request.user.profil.boutique)
        produit = mouvement.produit

        if mouvement.type_mouvement == 'ENTREE':
            produit.quantite_en_stock += mouvement.quantite

        elif mouvement.type_mouvement == 'SORTIE':
            # Règle métier : aucun stock négatif
            if produit.quantite_en_stock < mouvement.quantite:
                raise ValidationError(
                    f"Stock insuffisant pour '{produit.nom}'. "
                    f"Disponible : {produit.quantite_en_stock}, demandé : {mouvement.quantite}."
                )
            produit.quantite_en_stock -= mouvement.quantite

        elif mouvement.type_mouvement == 'AJUSTEMENT':
            # Un ajustement d'inventaire fixe le stock à la quantité réelle constatée
            if mouvement.quantite < 0:
                raise ValidationError("La quantité d'ajustement ne peut pas être négative.")
            produit.quantite_en_stock = mouvement.quantite

        produit.save()
