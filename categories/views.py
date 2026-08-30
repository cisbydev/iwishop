from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Categorie
from .serializers import CategorieSerializer

class CategorieViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = Categorie.objects.all()
    serializer_class = CategorieSerializer
    permission_classes = [IsAuthenticated]
    # Suppression réservée au propriétaire (P1 point 6 - RBAC).
    actions_reservees_proprietaire = ('destroy',)