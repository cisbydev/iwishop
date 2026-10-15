from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

from tenants.validators import TAILLE_MAX_IMAGE

# Photo de produit (plan validé le 2026-10-16, D1 à D3) : le fichier envoyé
# n'est jamais stocké tel quel. Il est contrôlé (taille, nombre de pixels,
# format lu dans le contenu et non dans l'extension), puis ré-encodé en
# WebP, réduit à 800 px au plus sur son plus grand côté, orientation
# appliquée et métadonnées supprimées (EXIF, dont la position GPS).
COTE_MAX = 800
QUALITE_WEBP = 80
PIXELS_MAX = 40_000_000
FORMATS_ACCEPTES = {'JPEG', 'PNG', 'WEBP'}

MESSAGE_FORMAT = "Format d'image non accepté. Choisissez une photo JPG ou PNG."
MESSAGE_ILLISIBLE = "Image illisible ou incomplète. Choisissez une autre photo."
MESSAGE_TROP_LOURDE = f"L'image ne doit pas dépasser {TAILLE_MAX_IMAGE // (1024 * 1024)} Mo."
MESSAGE_TROP_GRANDE = f"L'image est trop grande ({PIXELS_MAX // 1_000_000} mégapixels au plus)."


def traiter_photo(fichier):
    """Contrôle la photo envoyée et renvoie ses octets en WebP.

    Ordre des contrôles : taille du fichier, puis ouverture par Pillow
    (en-tête seulement), nombre de pixels et format réel, et seulement
    ensuite le décodage. Lève une ValidationError de DRF (réponse 400)
    pour tout fichier refusé, jamais une autre exception.

    HEIC (photo d'iPhone) : Pillow ne sait pas le lire, il est donc refusé
    comme un fichier illisible, avec MESSAGE_FORMAT. Image animée : seule
    la première image est gardée."""
    if fichier.size > TAILLE_MAX_IMAGE:
        raise ValidationError(MESSAGE_TROP_LOURDE)

    fichier.seek(0)
    try:
        with Image.open(fichier) as image:
            if image.format not in FORMATS_ACCEPTES:
                raise ValidationError(MESSAGE_FORMAT)
            largeur, hauteur = image.size
            if largeur * hauteur > PIXELS_MAX:
                raise ValidationError(MESSAGE_TROP_GRANDE)
            # Décodage complet ici : une image tronquée ou abîmée échoue
            # maintenant (OSError), avant tout traitement.
            image.load()
            redressee = ImageOps.exif_transpose(image)
    except UnidentifiedImageError:
        raise ValidationError(MESSAGE_FORMAT)
    except Image.DecompressionBombError:
        raise ValidationError(MESSAGE_TROP_GRANDE)
    except (OSError, SyntaxError, ValueError):
        raise ValidationError(MESSAGE_ILLISIBLE)

    transparente = redressee.mode in ('RGBA', 'LA', 'PA') or (
        redressee.mode == 'P' and 'transparency' in redressee.info
    )
    propre = redressee.convert('RGBA' if transparente else 'RGB')
    # thumbnail ne fait que réduire : une petite image garde sa taille.
    propre.thumbnail((COTE_MAX, COTE_MAX), Image.Resampling.LANCZOS)
    # Aucune métadonnée ne doit être réécrite (EXIF, XMP, profil ICC).
    # Pillow 12 n'écrit dans un WebP que celles passées en option à save()
    # (exif=, icc_profile=, xmp=) : ne jamais en passer. info, que convert()
    # recopie depuis la source, est vidé par précaution.
    propre.info.clear()

    sortie = BytesIO()
    propre.save(sortie, format='WEBP', quality=QUALITE_WEBP, method=6)
    return sortie.getvalue()
