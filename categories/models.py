from django.db import models

class Categorie(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    # Unique PAR BOUTIQUE (voir Meta.constraints), pas globalement : deux
    # boutiques différentes doivent pouvoir chacune avoir une catégorie
    # "Alimentation" (audit point 9, faille identifiée de longue date).
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
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