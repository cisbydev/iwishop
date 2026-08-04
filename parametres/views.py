from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import ParametresBoutique
from .serializers import ParametresBoutiqueSerializer

class ParametresBoutiqueView(generics.RetrieveUpdateAPIView):
    queryset = ParametresBoutique.objects.all()
    serializer_class = ParametresBoutiqueSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Récupère toujours le premier objet ou le crée s'il n'existe pas encore
        obj, created = ParametresBoutique.objects.get_or_create(pk=1)
        return obj