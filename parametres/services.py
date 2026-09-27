from .models import ParametresBoutique


def parametres_boutique(boutique):
    """get_or_create comme ParametresBoutiqueView.get_object() : une
    boutique n'a pas forcément encore de ParametresBoutique créé
    explicitement (default="FCFA" s'applique alors). Point d'accès commun
    pour lire les paramètres d'une boutique hors de la vue Paramètres
    (exports, notifications, messages de crédit...)."""
    parametres, _ = ParametresBoutique.objects.get_or_create(boutique=boutique)
    return parametres


def devise_boutique(boutique):
    """Devise à afficher dans tout message ou export monétaire : jamais un
    littéral "FCFA" dans le code (cf. bug déjà rencontré sur l'export PDF)."""
    return parametres_boutique(boutique).devise
