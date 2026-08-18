from decimal import Decimal
from django.db import models
from categories.models import Categorie
import uuid

# Unités de vente créées par défaut pour toute boutique (nouvelle ou
# existante backfillée). Utilisée par tenants.views (onboarding) et
# products.serializers (synchro ProduitPrix). Ne pas importer dans une
# migration : les migrations doivent rester figées indépendamment du code
# applicatif courant (voir products/migrations/0007_backfill_unites_prix.py,
# qui a ses propres valeurs en dur).
UNITES_PAR_DEFAUT = [('Unité', Decimal('1.000')), ('Douzaine', Decimal('12.000'))]

class Produit(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
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


class UniteVente(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE, related_name='unites_vente')
    nom = models.CharField(max_length=50)  # "Kg", "Sac 25kg", "Douzaine"...
    facteur_conversion = models.DecimalField(max_digits=10, decimal_places=3)
    # facteur_conversion = combien d'unités de STOCK (unité de base, en
    # DecimalField) représente une vente de cette unité.
    # Ex: "Kg" = 1.000, "Demi-kg" = 0.500, "Sac 25kg" = 25.000, "Douzaine" = 12.000

    class Meta:
        unique_together = ['boutique', 'nom']
        ordering = ['nom']

    def __str__(self):
        return f"{self.nom} ({self.boutique.nom})"


class ProduitPrix(models.Model):
    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name='prix_par_unite')
    unite = models.ForeignKey(UniteVente, on_delete=models.CASCADE)
    prix = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ['produit', 'unite']

    def __str__(self):
        return f"{self.produit.nom} - {self.unite.nom} : {self.prix}"