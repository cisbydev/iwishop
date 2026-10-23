from products.photos import enregistrer_image, retirer_image, supprimer_image_apres_commit, traiter_photo

from .models import Categorie

# Image de catégorie (plan validé par Mahamadou le 2026-10-23) : mêmes
# contrôles que la photo de produit (taille, pixels, format réel, EXIF
# supprimé), puis carré recadré au centre, 320 px au plus, WebP qualité 80.
COTE_IMAGE = 320


def traiter_image_categorie(fichier):
    return traiter_photo(fichier, cote_max=COTE_IMAGE, carre=True)


def enregistrer_image_categorie(categorie, octets):
    return enregistrer_image(categorie, 'image', octets)


def retirer_image_categorie(categorie):
    return retirer_image(categorie, 'image')


def supprimer_image_categorie_apres_commit(nom):
    supprimer_image_apres_commit(Categorie._meta.get_field('image').storage, nom)
