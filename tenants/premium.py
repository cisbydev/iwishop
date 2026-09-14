from rest_framework.exceptions import PermissionDenied


CODE_PALIER_INSUFFISANT = 'PALIER_INSUFFISANT'


def verifier_acces_premium(boutique):
    """Réservé aux écritures des fonctionnalités Premium (crédit client) :
    jamais appelé depuis get_queryset()/une lecture, même principe que
    BoutiqueScopedMixin._verifier_acces() pour l'abonnement en général.

    Le detail est un dict (pas une simple chaîne) pour exposer un `code`
    machine-readable à côté du message : le frontend ne doit jamais avoir
    à parser du texte français fragile pour distinguer ce refus précis
    des autres 403 possibles."""
    if not boutique.a_acces_premium():
        raise PermissionDenied({
            "detail": "Fonctionnalité réservée au palier Premium.",
            "code": CODE_PALIER_INSUFFISANT,
        })
