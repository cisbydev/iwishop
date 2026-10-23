import uuid

from django.db import models


def chemin_image_categorie(instance, filename):
    # Un dossier par boutique, un nouveau nom à chaque envoi. Le nom du
    # fichier envoyé n'est jamais utilisé : l'image est toujours ré-encodée
    # en WebP (categories.images.traiter_image_categorie).
    # Référencée par la migration 0005 : ne pas renommer.
    return f'categories/{instance.boutique_id}/{uuid.uuid4().hex}.webp'


class Categorie(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    # Unique PAR BOUTIQUE (voir Meta.constraints), pas globalement : deux
    # boutiques différentes doivent pouvoir chacune avoir une catégorie
    # "Alimentation" (audit point 9, faille identifiée de longue date).
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    # Miniature carrée (plan validé le 2026-10-23) : jamais envoyée avec la
    # catégorie (lecture seule dans CategorieSerializer), seulement par
    # POST/DELETE categories/{id}/image/, qui la contrôle et la ré-encode.
    image = models.ImageField(upload_to=chemin_image_categorie, blank=True, null=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nom

    class Meta:
        verbose_name = "Catégorie"
        verbose_name_plural = "Catégories"
        ordering = ['nom']
        constraints = [
            models.UniqueConstraint(fields=['boutique', 'nom'], name='unique_categorie_nom_par_boutique'),
        ]