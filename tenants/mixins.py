from rest_framework.exceptions import PermissionDenied

class BoutiqueScopedMixin:
    def get_queryset(self):
        boutique = self.request.user.profil.boutique
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        return super().get_queryset().filter(boutique=boutique)

    def perform_create(self, serializer):
        boutique = self.request.user.profil.boutique
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        serializer.save(boutique=boutique)
