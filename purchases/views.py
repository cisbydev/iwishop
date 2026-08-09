from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from tenants.mixins import BoutiqueScopedMixin
from .models import Achat
from .serializers import AchatSerializer

class AchatViewSet(BoutiqueScopedMixin, viewsets.ModelViewSet):
    queryset = Achat.objects.all()
    serializer_class = AchatSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # AchatSerializer.create() résout et assigne déjà `boutique` lui-même
        # (via self.context['request']) : ne pas le repasser ici, sinon
        # Achat.objects.create(boutique=..., **validated_data) reçoit deux fois
        # le même kwarg (BoutiqueScopedMixin.perform_create l'injecterait aussi).
        serializer.save()