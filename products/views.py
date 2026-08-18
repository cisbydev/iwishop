from django.db.models import ProtectedError
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from tenants.mixins import BoutiqueScopedMixin
from .models import Produit, UniteVente, ProduitPrix
from .serializers import ProduitSerializer, UniteVenteSerializer

class ProduitViewSet(BoutiqueScopedMixin, viewsets.ModelViewSet):
    queryset = Produit.objects.all()
    serializer_class = ProduitSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['categorie']
    search_fields = ['nom', 'reference', 'description']
    ordering_fields = ['nom', 'prix_unitaire', 'quantite_en_stock', 'date_creation']


class UniteVenteViewSet(BoutiqueScopedMixin, viewsets.ModelViewSet):
    queryset = UniteVente.objects.all()
    serializer_class = UniteVenteSerializer
    permission_classes = [IsAuthenticated]

    MESSAGE_UNITE_SYSTEME = (
        "Cette unité est utilisée par le système, elle ne peut pas être "
        "renommée ou supprimée."
    )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        nouveau_nom = request.data.get('nom')
        if instance.est_systeme and nouveau_nom is not None and nouveau_nom != instance.nom:
            return Response({"detail": self.MESSAGE_UNITE_SYSTEME}, status=status.HTTP_400_BAD_REQUEST)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        if instance.est_systeme:
            return Response({"detail": self.MESSAGE_UNITE_SYSTEME}, status=status.HTTP_400_BAD_REQUEST)

        nb_prix_lies = ProduitPrix.objects.filter(unite=instance).count()
        if nb_prix_lies > 0 and request.query_params.get('force') != 'true':
            return Response(
                {
                    "detail": (
                        f"Cette unité est utilisée dans {nb_prix_lies} prix produit. "
                        f"Les supprimer aussi ? Relancez la suppression avec ?force=true pour confirmer."
                    ),
                    "nb_produit_prix_lies": nb_prix_lies,
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"detail": "Cette unité est utilisée dans des ventes existantes et ne peut pas être supprimée."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(status=status.HTTP_204_NO_CONTENT)