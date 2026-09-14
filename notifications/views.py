from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from tenants.mixins import BoutiqueScopedMixin
from .models import DestinataireNotification, Notification
from .serializers import NotificationSerializer


class NotificationViewSet(BoutiqueScopedMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    # Pas de create/update/destroy exposés : une notification est produite
    # par le code métier (stock bas, dette en retard), jamais par l'API.
    # Seules deux écritures existent, via les actions ci-dessous.
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # BoutiqueScopedMixin.get_queryset() applique déjà le scoping
        # boutique - un Employé ne doit en plus jamais voir une
        # notification réservée au propriétaire.
        queryset = super().get_queryset()
        profil = getattr(self.request.user, 'profil', None)
        est_proprietaire = bool(profil and profil.est_proprietaire)
        if not est_proprietaire:
            queryset = queryset.filter(destinataire_role=DestinataireNotification.TOUS)
        return queryset

    @action(detail=True, methods=['post'])
    def marquer_lue(self, request, pk=None):
        # get_object() passe par get_queryset() ci-dessus : impossible de
        # marquer lue une notification d'une autre boutique ou réservée au
        # propriétaire si on est employé.
        notification = self.get_object()
        if not notification.lue:
            notification.lue = True
            notification.save(update_fields=['lue'])
        serializer = self.get_serializer(notification)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def non_lues_count(self, request):
        # Évite de charger toute la liste juste pour le badge de la cloche.
        count = self.get_queryset().filter(lue=False).count()
        return Response({"count": count})
