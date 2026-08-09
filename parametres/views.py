from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import ParametresBoutique
from .serializers import ParametresBoutiqueSerializer

class ParametresBoutiqueView(generics.RetrieveUpdateAPIView):
    queryset = ParametresBoutique.objects.all()
    serializer_class = ParametresBoutiqueSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        boutique = self.request.user.profil.boutique
        obj, created = ParametresBoutique.objects.get_or_create(boutique=boutique)
        return obj