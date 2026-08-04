from django.db import models
from categories.models import Categorie
import uuid 

class Produit(models.Model):
    nom = models.CharField(max_length=150)
    reference = models.CharField(max_length=50, unique=True, blank=True)
    categorie = models.ForeignKey(Categorie, on_delete=models.SET_NULL, null=True, blank=True, related_name='produits')
    description = models.TextField(blank=True, null=True)

    # Prix (utilisant Decimal pour la précision financière)
    prix_achat = models.DecimalField(max_digits=12, decimal_places=2)
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2)
    prix_douzaine = models.DecimalField(max_digits=12, decimal_places=2)

    # Stock
    quantite_en_stock = models.IntegerField(default=0)
    stock_minimum = models.IntegerField(default=5)

    # Média et dates
    photo = models.ImageField(upload_to='produits/', blank=True, null=True)
    date_creation = models.DateTimeField(auto_now_add=True)


    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"PROD-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nom} ({self.reference})"

    class Meta:
        verbose_name = "Produit"
        verbose_name_plural = "Produits"
        ordering = ['-date_creation']