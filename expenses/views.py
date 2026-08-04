from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Depense
from .serializers import DepenseSerializer

class DepenseViewSet(viewsets.ModelViewSet):
    queryset = Depense.objects.all()
    serializer_class = DepenseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['categorie', 'date_depense']