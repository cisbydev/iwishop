from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Fournisseur
from .serializers import FournisseurSerializer

class FournisseurViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = Fournisseur.objects.all()
    serializer_class = FournisseurSerializer
    permission_classes = [IsAuthenticated]
    # Suppression réservée au propriétaire (P1 point 6 - RBAC).
    actions_reservees_proprietaire = ('destroy',)