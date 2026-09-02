from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

# Audit point 10 : les deux champs image du projet (Produit.photo,
# ParametresBoutique.logo) n'avaient aucune limite de taille ni de format -
# seule la vérification que le contenu est une image décodable (Pillow, via
# ImageField) existait. Un fichier volumineux (mais une "vraie" image) était
# accepté sans borne.

TAILLE_MAX_IMAGE = 5 * 1024 * 1024  # 5 Mo

extensions_image_autorisees = FileExtensionValidator(
    allowed_extensions=['jpg', 'jpeg', 'png', 'webp'],
    message="Formats d'image acceptés : JPG, JPEG, PNG, WEBP.",
)


def valider_taille_image(fichier):
    if fichier.size > TAILLE_MAX_IMAGE:
        raise ValidationError(
            f"L'image ne doit pas dépasser {TAILLE_MAX_IMAGE // (1024 * 1024)} Mo."
        )
