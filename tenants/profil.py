from rest_framework.exceptions import PermissionDenied


def _profils_de(user):
    """Tous les Profil de l'utilisateur, boutique préchargée, triés par id
    croissant - ordre stable partagé par le fallback sans en-tête ici et
    par la vérification "au moins une boutique active" au login."""
    return list(user.profils.select_related('boutique').order_by('id'))


def profil_par_defaut(user):
    """Profil à utiliser en l'absence d'en-tête X-Boutique-Active : la
    première boutique ACTIVE (id croissant), sinon la toute première
    boutique tout court - compat mono-boutique / anciens clients frontend
    qui n'envoient pas encore l'en-tête. None si l'utilisateur n'a aucun
    Profil."""
    profils = _profils_de(user)
    if not profils:
        return None
    for profil in profils:
        if profil.boutique.actif:
            return profil
    return profils[0]


def boutique_de(request):
    """Boutique de l'utilisateur connecté, via son Profil.

    Point d'accès unique pour request.user.profil.boutique (audit point
    11) : un compte authentifié sans Profil (le superuser/administrateur
    de la plateforme, qui n'est jamais rattaché à une boutique) faisait
    planter en 500 chacun des 11 accès directs dispersés dans les
    ViewSets et serializers. Lève ici une 403 propre à la place.

    Multi-boutique : un compte peut avoir plusieurs Profil (une boutique
    chacun).
    - En-tête X-Boutique-Active présent -> il doit correspondre à un
      Profil de CET utilisateur, sinon 403 (jamais confiance en l'id
      envoyé sans vérifier l'appartenance).
    - Absent -> profil_par_defaut() (boutique active la plus ancienne,
      sinon la toute première).
    """
    boutique_active_id = request.headers.get('X-Boutique-Active')
    if boutique_active_id:
        try:
            boutique_active_id = int(boutique_active_id)
        except (TypeError, ValueError):
            raise PermissionDenied("Cette boutique n'est pas accessible depuis ce compte.")
        profil = request.user.profils.select_related('boutique').filter(
            boutique_id=boutique_active_id
        ).first()
        if profil is None:
            raise PermissionDenied("Cette boutique n'est pas accessible depuis ce compte.")
        return profil.boutique

    profil = profil_par_defaut(request.user)
    if profil is None:
        raise PermissionDenied("Ce compte n'est rattaché à aucune boutique.")
    return profil.boutique
