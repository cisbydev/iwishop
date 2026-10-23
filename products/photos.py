import logging
from functools import partial
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from django.core.files.base import ContentFile
from django.db import transaction
from rest_framework.exceptions import ValidationError

from tenants.validators import TAILLE_MAX_IMAGE

from .models import Produit

logger = logging.getLogger(__name__)

# Photo de produit (plan validé le 2026-10-15, D1 à D3) : le fichier envoyé
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


def traiter_photo(fichier, cote_max=COTE_MAX, carre=False):
    """Contrôle la photo envoyée et renvoie ses octets en WebP.

    cote_max : plus grand côté de la sortie (800 px pour un produit).
    carre : recadre au centre en carré (image de catégorie), de cote_max
    au plus. Dans les deux cas, une petite image n'est jamais agrandie.

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
    if carre:
        cote = min(cote_max, *propre.size)
        propre = ImageOps.fit(propre, (cote, cote), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    else:
        # thumbnail ne fait que réduire : une petite image garde sa taille.
        propre.thumbnail((cote_max, cote_max), Image.Resampling.LANCZOS)
    # Aucune métadonnée ne doit être réécrite (EXIF, XMP, profil ICC).
    # Pillow 12 n'écrit dans un WebP que celles passées en option à save()
    # (exif=, icc_profile=, xmp=) : ne jamais en passer. info, que convert()
    # recopie depuis la source, est vidé par précaution.
    propre.info.clear()

    sortie = BytesIO()
    propre.save(sortie, format='WEBP', quality=QUALITE_WEBP, method=6)
    return sortie.getvalue()


def _supprimer_fichier(nom):
    """Supprime un fichier du stockage sans jamais faire échouer la requête :
    un échec (R2 injoignable) est journalisé en ERROR (événement Sentry) et
    laisse au pire un fichier orphelin dans le bucket."""
    try:
        Produit._meta.get_field('photo').storage.delete(nom)
    except Exception:
        logger.error("Photo de produit non supprimée du stockage : %s", nom, exc_info=True)


def supprimer_photo_apres_commit(nom):
    """L'ancien fichier n'est supprimé qu'une fois la base à jour : si la
    transaction échoue, la photo encore référencée reste en place."""
    if nom:
        transaction.on_commit(partial(_supprimer_fichier, nom))


def enregistrer_photo(produit, octets):
    """Enregistre la photo (octets WebP de traiter_photo) et remplace
    l'ancienne. Le fichier est écrit avant la transaction (pas d'appel
    réseau pendant le verrou) ; si la base échoue ensuite, il est supprimé.
    Le produit est verrouillé (select_for_update) : deux envois simultanés
    ne lisent jamais le même ancien fichier, sinon l'un des nouveaux
    resterait orphelin."""
    champ = Produit._meta.get_field('photo')
    nouveau = champ.storage.save(champ.generate_filename(produit, 'photo.webp'), ContentFile(octets))
    try:
        with transaction.atomic():
            verrouille = Produit.objects.select_for_update().get(pk=produit.pk)
            ancien = verrouille.photo.name
            verrouille.photo = nouveau
            verrouille.save(update_fields=['photo'])
            supprimer_photo_apres_commit(ancien)
    except Exception:
        _supprimer_fichier(nouveau)
        raise
    return verrouille


def retirer_photo(produit):
    with transaction.atomic():
        verrouille = Produit.objects.select_for_update().get(pk=produit.pk)
        ancien = verrouille.photo.name
        if ancien:
            verrouille.photo = None
            verrouille.save(update_fields=['photo'])
            supprimer_photo_apres_commit(ancien)
    return verrouille
