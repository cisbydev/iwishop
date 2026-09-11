import hashlib

from rest_framework.throttling import SimpleRateThrottle


def _ip_client(request):
    """Détermine l'IP réelle du client derrière l'infrastructure Cloudflare
    + Render.

    CORRECTION CRITIQUE (vérification empirique) : l'hypothèse précédente
    ("Render place l'IP réelle en première position de X-Forwarded-For")
    reposait uniquement sur une réponse publique de l'équipe Render datant
    de 2021, jamais re-testée. Un test empirique réel (curl depuis un
    réseau externe, avec et sans en-tête X-Forwarded-For falsifié, logs
    Render capturés et analysés) a prouvé cette hypothèse FAUSSE et
    exploitable : la première position est exactement celle qu'un
    attaquant contrôle en injectant sa propre valeur dans l'en-tête envoyé
    au serveur.

    Preuve concrète recueillie :
    - Sans falsification : X-Forwarded-For =
      "41.73.104.116, 172.68.103.191, 10.30.70.4" -> vraie IP en
      position 0 (= aussi en position -3 sur une liste à 3 éléments).
    - Avec X-Forwarded-For falsifié à "1.2.3.4" envoyé par le client :
      X-Forwarded-For reçu = "1.2.3.4, 41.73.104.116, 104.23.243.244,
      10.30.70.4" -> la valeur falsifiée occupe la position 0, la vraie
      IP est repoussée en position 1 (= position -3 sur une liste à 4
      éléments).

    Règle correcte identifiée empiriquement : la vraie IP client se
    trouve TOUJOURS exactement à la TROISIÈME position en partant de la
    FIN de la liste (index -3), quel que soit le nombre d'entrées
    falsifiées ajoutées par le client au début. Explication par
    l'infrastructure réelle : l'edge Cloudflare, qui termine la véritable
    connexion TCP du client, insère la vraie IP à cet endroit précis (non
    falsifiable par le client, qui ne contrôle que ce qui précède) ; puis
    exactement DEUX sauts de confiance supplémentaires ajoutent chacun
    leur propre entrée avant que la requête n'atteigne Django (un nœud
    Cloudflare interne qui varie à chaque requête, puis le proxy interne
    de Render en adresse privée 10.x). D'où : [.. falsifiable par le
    client ..], IP_réelle, hop_interne_cloudflare, hop_interne_render.

    Limite assumée et documentée : cette position fixe (-3) dépend de
    cette topologie précise (2 sauts de confiance fixes après
    l'insertion Cloudflare). Si l'infrastructure change (ajout/retrait
    d'un hop entre Cloudflare et Django), cette règle devra être
    revérifiée empiriquement de la même façon plutôt que supposée à
    nouveau.

    Repli sur REMOTE_ADDR si l'en-tête est absent, ou contient moins de 3
    entrées (connexion directe sans passer par Cloudflare, environnement
    de test/dev local) : dans ce cas la position -3 n'existe pas ou ne
    serait pas fiable, mieux vaut se rabattre explicitement que de
    retourner une valeur incorrecte.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        entrees = [entree.strip() for entree in xff.split(',')]
        if len(entrees) >= 3 and entrees[-3]:
            return entrees[-3]
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
