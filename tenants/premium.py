from rest_framework.exceptions import PermissionDenied


def verifier_acces_premium(boutique):
    """Réservé aux écritures des fonctionnalités Premium (crédit client) :
    jamais appelé depuis get_queryset()/une lecture, même principe que
    BoutiqueScopedMixin._verifier_acces() pour l'abonnement en général."""
    if not boutique.a_acces_premium():
        raise PermissionDenied("Fonctionnalité réservée au palier Premium.")
