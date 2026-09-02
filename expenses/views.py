from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Depense
from .serializers import DepenseSerializer


class DepenseViewSet(
    BoutiqueScopedMixin,
    RestrictedActionsForOwnerMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    # Une dépense validée est une écriture comptable : une fois créée, elle
    # ne doit plus être modifiable ni supprimable (PUT/PATCH/DELETE
    # désactivés, même principe que Vente/Achat/MouvementStock). Pour
    # corriger une erreur, on l'annule via l'action `annuler`, qui marque ce
    # statut sans jamais effacer l'historique (P2 point 15 : avant cette
    # correction, une dépense pouvait être réécrite ou effacée en dur, même
    # restreinte au propriétaire).
    # select_related('utilisateur') : utilisateur_nom (serializer) ferait
    # sinon une requête par dépense listée (N+1, audit point 13).
    queryset = Depense.objects.select_related('utilisateur')
    serializer_class = DepenseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['categorie', 'date_depense', 'statut']
    # Annuler une dépense déjà entrée (Rapports/Résumé financier) : réservé
    # au propriétaire (P1 point 6 - RBAC), même traitement que
    # Vente.annuler/Achat.annuler. La création reste ouverte (un employé
    # doit pouvoir déclarer une dépense).
    actions_reservees_proprietaire = ('annuler',)

    def perform_create(self, serializer):
        # Enregistre l'employé auteur de la dépense (P2 point 16 -
        # traçabilité) en plus de la boutique déjà injectée par le mixin.
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save(boutique=boutique, utilisateur=self.request.user)

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        # get_object() applique le scoping boutique (BoutiqueScopedMixin) :
        # impossible d'annuler la dépense d'une autre boutique.
        depense = self.get_object()
        if depense.statut == 'ANNULEE':
            raise ValidationError("Cette dépense est déjà annulée.")
        depense.statut = 'ANNULEE'
        depense.save(update_fields=['statut'])
        serializer = self.get_serializer(depense)
        return Response(serializer.data)
