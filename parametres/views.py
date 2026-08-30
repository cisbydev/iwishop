from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsOwner
from .models import ParametresBoutique
from .serializers import ParametresBoutiqueSerializer

class ParametresBoutiqueView(generics.RetrieveUpdateAPIView):
    queryset = ParametresBoutique.objects.all()
    serializer_class = ParametresBoutiqueSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Modifier la configuration de la boutique est réservé au
        # propriétaire (P1 point 6 - RBAC) ; la lecture reste ouverte à
        # tout employé. Pas de `.action` ici (vue générique, pas un
        # ViewSet) : on distingue sur la méthode HTTP.
        if self.request.method in ('PUT', 'PATCH'):
            return [IsAuthenticated(), IsOwner()]
        return super().get_permissions()

    def get_object(self):
        boutique = self.request.user.profil.boutique
        obj, created = ParametresBoutique.objects.get_or_create(boutique=boutique)
        return obj