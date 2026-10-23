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


# Enregistrement, remplacement et retrait d'un fichier image, communs aux
# photos de produits, aux images de catégories et au logo de la boutique
# (même champ ImageField, même stockage, mêmes garanties).

def _supprimer_fichier(stockage, nom):
    """Supprime un fichier du stockage sans jamais faire échouer la requête :
    un échec (R2 injoignable) est journalisé en ERROR (événement Sentry) et
    laisse au pire un fichier orphelin dans le bucket."""
    try:
        stockage.delete(nom)
    except Exception:
        logger.error("Image non supprimée du stockage : %s", nom, exc_info=True)


def supprimer_image_apres_commit(stockage, nom):
    """L'ancien fichier n'est supprimé qu'une fois la base à jour : si la
    transaction échoue, l'image encore référencée reste en place."""
    if nom:
        transaction.on_commit(partial(_supprimer_fichier, stockage, nom))


def enregistrer_image(instance, nom_champ, octets, supprimer_ancienne=True):
    """Enregistre l'image (octets WebP de traiter_photo) dans le champ
    `nom_champ` et remplace l'ancienne. Le fichier est écrit avant la
    transaction (pas d'appel réseau pendant le verrou) ; si la base échoue
    ensuite, il est supprimé. La ligne est verrouillée (select_for_update) :
    deux envois simultanés ne lisent jamais le même ancien fichier, sinon
    l'un des nouveaux resterait orphelin. supprimer_ancienne=False garde
    l'ancien fichier (logo : les factures émises le référencent)."""
    modele = type(instance)
    champ = modele._meta.get_field(nom_champ)
    nouveau = champ.storage.save(champ.generate_filename(instance, 'image.webp'), ContentFile(octets))
    try:
        with transaction.atomic():
            verrouille = modele.objects.select_for_update().get(pk=instance.pk)
            ancien = getattr(verrouille, nom_champ).name
            setattr(verrouille, nom_champ, nouveau)
            verrouille.save(update_fields=[nom_champ])
            if supprimer_ancienne:
                supprimer_image_apres_commit(champ.storage, ancien)
    except Exception:
        _supprimer_fichier(champ.storage, nouveau)
        raise
    return verrouille


def retirer_image(instance, nom_champ):
    modele = type(instance)
    champ = modele._meta.get_field(nom_champ)
    with transaction.atomic():
        verrouille = modele.objects.select_for_update().get(pk=instance.pk)
        ancien = getattr(verrouille, nom_champ).name
        if ancien:
            setattr(verrouille, nom_champ, None)
            verrouille.save(update_fields=[nom_champ])
            supprimer_image_apres_commit(champ.storage, ancien)
    return verrouille


def supprimer_photo_apres_commit(nom):
    supprimer_image_apres_commit(Produit._meta.get_field('photo').storage, nom)


def enregistrer_photo(produit, octets):
    return enregistrer_image(produit, 'photo', octets)


def retirer_photo(produit):
    return retirer_image(produit, 'photo')
