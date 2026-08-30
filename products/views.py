from django.db.models import ProtectedError
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Produit, UniteVente, ProduitPrix
from .serializers import ProduitSerializer, UniteVenteSerializer, ProduitPrixSerializer

class ProduitViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = Produit.objects.all()
    serializer_class = ProduitSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['categorie']
    search_fields = ['nom', 'reference', 'description']
    ordering_fields = ['nom', 'prix_unitaire', 'quantite_en_stock', 'date_creation']
    # Suppression réservée au propriétaire (P1 point 6 - RBAC) : casse
    # potentiellement l'historique achats/ventes lié au produit.
    actions_reservees_proprietaire = ('destroy',)


class UniteVenteViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = UniteVente.objects.all()
    serializer_class = UniteVenteSerializer
    permission_classes = [IsAuthenticated]
    actions_reservees_proprietaire = ('destroy',)

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


class ProduitPrixViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = ProduitPrix.objects.all()
    serializer_class = ProduitPrixSerializer
    permission_classes = [IsAuthenticated]
    boutique_lookup = 'produit__boutique'
    actions_reservees_proprietaire = ('destroy',)

    def _verifier_appartenance(self, serializer, boutique):
        produit = serializer.validated_data.get('produit', getattr(serializer.instance, 'produit', None))
        if produit.boutique_id != boutique.id:
            raise PermissionDenied("Ce produit n'appartient pas à votre boutique.")
        unite = serializer.validated_data.get('unite', getattr(serializer.instance, 'unite', None))
        if unite.boutique_id != boutique.id:
            raise PermissionDenied("Cette unité n'appartient pas à votre boutique.")

    def perform_create(self, serializer):
        boutique = self._boutique_effective()
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        self._verifier_appartenance(serializer, boutique)
        serializer.save()

    def perform_update(self, serializer):
        boutique = self._boutique_effective()
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        self._verifier_appartenance(serializer, boutique)
        serializer.save()