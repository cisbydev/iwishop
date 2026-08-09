from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from tenants.mixins import BoutiqueScopedMixin
from .models import Fournisseur
from .serializers import FournisseurSerializer

class FournisseurViewSet(BoutiqueScopedMixin, viewsets.ModelViewSet):
    queryset = Fournisseur.objects.all()
    serializer_class = FournisseurSerializer
    permission_classes = [IsAuthenticated]