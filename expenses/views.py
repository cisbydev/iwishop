from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Depense
from .serializers import DepenseSerializer

class DepenseViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = Depense.objects.all()
    serializer_class = DepenseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['categorie', 'date_depense']
    # Modifier/supprimer une dépense après coup pourrait masquer un
    # problème : réservé au propriétaire (P1 point 6 - RBAC). La création
    # reste ouverte (un employé doit pouvoir déclarer une dépense).
    actions_reservees_proprietaire = ('update', 'partial_update', 'destroy')