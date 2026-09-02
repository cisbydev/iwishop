from rest_framework.exceptions import PermissionDenied


def boutique_de(request):
    """Boutique de l'utilisateur connecté, via son Profil.

    Point d'accès unique pour request.user.profil.boutique (audit point
    11) : un compte authentifié sans Profil (le superuser/administrateur
    de la plateforme, qui n'est jamais rattaché à une boutique) faisait
    planter en 500 chacun des 11 accès directs dispersés dans les
    ViewSets et serializers. Lève ici une 403 propre à la place.
    """
    if not hasattr(request.user, 'profil'):
        raise PermissionDenied("Ce compte n'est rattaché à aucune boutique.")
    return request.user.profil.boutique
