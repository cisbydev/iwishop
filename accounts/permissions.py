from rest_framework.permissions import BasePermission


class IsOwner(BasePermission):
    """
    Autorise uniquement le propriétaire de la boutique (compte superuser),
    créé via `python manage.py createsuperuser`.
    """
    message = "Seul le propriétaire de la boutique peut effectuer cette action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
