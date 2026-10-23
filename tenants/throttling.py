from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class DemandeAccesRateThrottle(SimpleRateThrottle):
    """Limite les demandes d'accès publiques par IP cliente.

    Pour les services publics Render, Cloudflare remplace CF-Connecting-IP
    par l'IP réelle du client. X-Forwarded-For est volontairement ignoré :
    il peut contenir une valeur ajoutée par le client avant le proxy.
    En local et en test, REMOTE_ADDR reste le repli.
    """
    scope = 'demande_acces'

    def get_cache_key(self, request, view):
        ident = request.META.get('HTTP_CF_CONNECTING_IP') or request.META.get('REMOTE_ADDR')
        if not ident:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class CreerPaiementRateThrottle(UserRateThrottle):
    """Limite creer-paiement/ par utilisateur connecté (pk du compte) :
    chaque appel accepté peut créer une facture PayDunya. La vue exige
    IsAuthenticated, vérifié avant ce throttle : le repli par IP de
    UserRateThrottle ne sert donc pas ici."""
    scope = 'creer_paiement'
