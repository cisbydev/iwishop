from django.db import models
from products.models import Produit

class MouvementStock(models.Model):
    TYPES_MOUVEMENT = (
        ('ENTREE', 'Entrée de stock'),
        ('SORTIE', 'Sortie de stock'),
        ('AJUSTEMENT', 'Ajustement d\'inventaire'),
    )

    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name='mouvements')
    type_mouvement = models.CharField(max_length=20, choices=TYPES_MOUVEMENT)
    quantite = models.IntegerField()
    motif = models.CharField(max_length=255, blank=True, null=True)
    date_mouvement = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.type_mouvement} - {self.produit.nom} ({self.quantite})"

    class Meta:
        verbose_name = "Mouvement de stock"
        verbose_name_plural = "Mouvements de stock"
        ordering = ['-date_mouvement']