from rest_framework.permissions import BasePermission, IsAuthenticated


class IsOwner(BasePermission):
    """
    Autorise uniquement le propriétaire de la boutique (Profil.est_proprietaire).
    """
    message = "Seul le propriétaire de la boutique peut effectuer cette action."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and hasattr(request.user, 'profil')
            and request.user.profil.est_proprietaire
        )


class RestrictedActionsForOwnerMixin:
    """Réserve certaines actions d'un ViewSet au propriétaire de la
    boutique (IsOwner), les autres restant sous IsAuthenticated - matrice
    RBAC validée au P1 point 6 (voir `actions_reservees_proprietaire` sur
    chaque ViewSet concerné)."""
    actions_reservees_proprietaire = ()

    def get_permissions(self):
        if self.action in self.actions_reservees_proprietaire:
            return [IsAuthenticated(), IsOwner()]
        return super().get_permissions()
