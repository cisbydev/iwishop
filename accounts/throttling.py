import hashlib

from rest_framework.throttling import SimpleRateThrottle


def _ip_client(request):
    """Détermine l'IP réelle du client derrière le proxy Render.

    Pas de NUM_PROXIES / get_ident() par défaut de DRF ici : ce mécanisme
    suppose que chaque hop AJOUTE son adresse à la fin de
    X-Forwarded-For (convention nginx classique), et prend donc une
    entrée en partant de la droite. Render fonctionne à l'inverse :
    l'équipe Render documente explicitement placer l'IP réelle du
    client en PREMIÈRE position de X-Forwarded-For, quoi que le client
    ait pu soumettre lui-même dans cet en-tête (cf.
    feedback.render.com/features/p/send-the-correct-x-forwarded-for,
    réponse Render : "we set the first IP in the list to the real
    client IP"). Prendre la dernière entrée serait donc ici la valeur la
    MOINS fiable, potentiellement contrôlée par le client.

    Aucun autre proxy n'est configuré devant l'app (pas de render.yaml
    ni de config proxy additionnelle trouvée dans ce repo) : Render est
    le seul hop.

    Limite assumée et documentée : repose sur ce comportement déclaré
    par Render (dernière confirmation publique datée de 2021, jamais
    re-vérifiée empiriquement depuis dans ce projet). Si un doute
    survient en prod, vérifier concrètement (ex. requêtes depuis deux
    réseaux différents, ou contacter le support Render) plutôt que de
    continuer à supposer.

    Repli sur REMOTE_ADDR si l'en-tête est absent (dev local, tests).
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        premiere_ip = xff.split(',')[0].strip()
        if premiere_ip:
            return premiere_ip
    return request.META.get('REMOTE_ADDR')


class LoginIPRateThrottle(SimpleRateThrottle):
    """Limite les tentatives de connexion par adresse IP cliente - vise le
    balayage de plusieurs comptes (ou le brute-force distribué sur un
    seul) depuis une même source. N'est appliqué qu'à
    CustomTokenObtainPairView (throttle_classes déclaré explicitement
    sur la vue) : DEFAULT_THROTTLE_CLASSES reste volontairement absent
    de REST_FRAMEWORK, aucune autre route n'est throttlée par ce biais.
    """
    scope = 'login_ip'

    def get_cache_key(self, request, view):
        ident = _ip_client(request)
        if ident is None:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class LoginUsernameRateThrottle(SimpleRateThrottle):
    """Limite les tentatives de connexion par identifiant normalisé - vise
    le brute-force ciblé sur UN compte précis, y compris depuis des IP
    différentes (rotation d'IP/botnet). La clé de cache est un hash
    SHA-256 de l'identifiant normalisé (strip + lower), jamais
    l'identifiant brut : un username (souvent personnel) n'a pas à
    apparaître lisible dans le backend de cache. Le mot de passe n'est
    jamais lu ici - uniquement `username`."""
    scope = 'login_username'

    def get_cache_key(self, request, view):
        data = request.data if isinstance(getattr(request, 'data', None), dict) else {}
        username = data.get('username')
        if not username:
            return None
        identifiant_normalise = str(username).strip().lower()
        if not identifiant_normalise:
            return None
        ident = hashlib.sha256(identifiant_normalise.encode('utf-8')).hexdigest()
        return self.cache_format % {'scope': self.scope, 'ident': ident}
