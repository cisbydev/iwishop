from django.db import models
from suppliers.models import Fournisseur
from products.models import Produit
from inventory.models import MouvementStock
from django.db import transaction

class Achat(models.Model):
    fournisseur = models.ForeignKey(Fournisseur, on_delete=models.SET_NULL, null=True, related_name='achats')
    date_achat = models.DateTimeField(auto_now_add=True)
    montant_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        fournisseur_nom = self.fournisseur.nom if self.fournisseur else "Inconnu"
        return f"Achat #{self.id} - {fournisseur_nom} ({self.date_achat.strftime('%d/%m/%Y')})"

    class Meta:
        verbose_name = "Achat"
        verbose_name_plural = "Achats"
        ordering = ['-date_achat']

class LigneAchat(models.Model):
    achat = models.ForeignKey(Achat, on_delete=models.CASCADE, related_name='lignes')
    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name='lignes_achat')
    quantite = models.IntegerField()
    prix_unitaire_achat = models.DecimalField(max_digits=12, decimal_places=2)
    sous_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False)

    def save(self, *args, **kwargs):
        # Calcul automatique du sous-total
        self.sous_total = self.quantite * self.prix_unitaire_achat
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantite} x {self.produit.nom} pour Achat #{self.achat.id}"