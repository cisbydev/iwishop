from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from tenants.mixins import BoutiqueScopedMixin
from .models import Produit, UniteVente
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