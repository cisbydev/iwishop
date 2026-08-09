from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from tenants.mixins import BoutiqueScopedMixin
from .models import Categorie
from .serializers import CategorieSerializer

class CategorieViewSet(BoutiqueScopedMixin, viewsets.ModelViewSet):
    queryset = Categorie.objects.all()
    serializer_class = CategorieSerializer
    permission_classes = [IsAuthenticated]