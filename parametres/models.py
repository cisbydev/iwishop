from django.db import models

class ParametresBoutique(models.Model):
    nom_boutique = models.CharField(max_length=150, default="SoraShop")
    logo = models.ImageField(upload_to='logos/', blank=True, null=True)
    adresse = models.TextField(blank=True, null=True)
    telephone = models.CharField(max_length=30, blank=True, null=True)
    devise = models.CharField(max_length=10, default="FCFA")
    tva = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

    def __str__(self):
        return self.nom_boutique

    class Meta:
        verbose_name = "Paramètre de la boutique"
        verbose_name_plural = "Paramètres de la boutique"