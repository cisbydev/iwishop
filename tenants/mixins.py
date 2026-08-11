from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

class BoutiqueScopedMixin:
    def _boutique_effective(self):
        request = self.request

        # Mode Vue Support : uniquement pour le superuser, uniquement
        # en lecture (GET/HEAD/OPTIONS), uniquement si le header est
        # explicitement présent.
        support_boutique_id = request.headers.get('X-Support-Boutique')
        if support_boutique_id and request.user.is_superuser:
            if request.method not in SAFE_METHODS:
                raise PermissionDenied("La Vue Support est en lecture seule.")
            from .models import Boutique
            try:
                return Boutique.objects.get(pk=support_boutique_id)
            except Boutique.DoesNotExist:
                raise PermissionDenied("Boutique de support introuvable.")

        return request.user.profil.boutique

    def get_queryset(self):
        boutique = self._boutique_effective()
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        return super().get_queryset().filter(boutique=boutique)

    def perform_create(self, serializer):
        boutique = self._boutique_effective()
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        serializer.save(boutique=boutique)
