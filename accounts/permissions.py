from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.exceptions import PermissionDenied


class IsOwner(BasePermission):
    """
    Autorise uniquement le propriétaire de la boutique ACTIVE (résolue par
    boutique_de : en-tête X-Boutique-Active ou fallback). Multi-boutique :
    un même compte peut être propriétaire d'une boutique et employé d'une
    autre, donc on vérifie le Profil de la boutique effectivement visée
    par la requête, jamais "un profil propriétaire quelque part".
    """
    message = "Seul le propriétaire de la boutique peut effectuer cette action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        from tenants.profil import boutique_de
        try:
            boutique = boutique_de(request)
        except PermissionDenied:
            return False

        return request.user.profils.filter(boutique=boutique, est_proprietaire=True).exists()


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
