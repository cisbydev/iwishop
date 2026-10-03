from decimal import ROUND_HALF_UP, Decimal

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


def formater_montant(montant, boutique):
    """Montant à afficher dans un message, avec la devise de la boutique.
    Même rendu que formatCurrency côté frontend (utils/formatters.js,
    Intl fr-FR) : 0 à 2 décimales (100 FCFA, 1 234,5 FCFA), virgule
    décimale, espace fine insécable entre les milliers."""
    montant = Decimal(montant).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    entier, _, decimales = f"{abs(montant):.2f}".partition('.')
    decimales = decimales.rstrip('0')
    texte = f"{int(entier):,}".replace(',', '\u202f')
    if decimales:
        texte += f",{decimales}"
    if montant < 0:
        texte = f"-{texte}"
    return f"{texte} {devise_boutique(boutique)}"
