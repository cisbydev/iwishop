from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Fournisseur
from .serializers import FournisseurSerializer

class FournisseurViewSet(viewsets.ModelViewSet):
    queryset = Fournisseur.objects.all()
    serializer_class = FournisseurSerializer
    permission_classes = [IsAuthenticated]