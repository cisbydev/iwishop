from rest_framework.permissions import BasePermission

class IsPlatformOwner(BasePermission):
    """Réservé à moi seul, le développeur/administrateur de la plateforme."""
    message = "Action réservée à l'administrateur de la plateforme."
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
