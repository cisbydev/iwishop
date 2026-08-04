from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Achat
from .serializers import AchatSerializer

class AchatViewSet(viewsets.ModelViewSet):
    queryset = Achat.objects.all()
    serializer_class = AchatSerializer
    permission_classes = [IsAuthenticated]