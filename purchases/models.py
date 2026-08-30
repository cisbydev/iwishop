from django.db import models
from suppliers.models import Fournisseur
from products.models import Produit
from inventory.models import MouvementStock
from django.db import transaction

class Achat(models.Model):
    STATUTS = (
        ('VALIDE', 'Validé'),
        ('ANNULE', 'Annulé'),
    )

    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    fournisseur = models.ForeignKey(Fournisseur, on_delete=models.SET_NULL, null=True, related_name='achats')
    date_achat = models.DateTimeField(auto_now_add=True)
    montant_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    notes = models.TextField(blank=True, null=True)
    # Un achat validé ne se modifie ni ne se supprime (cf. AchatViewSet) :
    # on l'annule via une écriture inverse qui retire le stock ajouté et
    # marque ce statut, sans jamais effacer l'historique.
    statut = models.CharField(max_length=20, choices=STATUTS, default='VALIDE')

    def __str__(self):
        fournisseur_nom = self.fournisseur.nom if self.fournisseur else "Inconnu"
        return f"Achat #{self.id} - {fournisseur_nom} ({self.date_achat.strftime('%d/%m/%Y')})"

    class Meta:
        verbose_name = "Achat"
        verbose_name_plural = "Achats"
        ordering = ['-date_achat']

class LigneAchat(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    achat = models.ForeignKey(Achat, on_delete=models.CASCADE, related_name='lignes')
    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name='lignes_achat')
    quantite = models.IntegerField()
    unite = models.ForeignKey('products.UniteVente', on_delete=models.PROTECT, related_name='lignes_achat')
    facteur_conversion_applique = models.DecimalField(max_digits=10, decimal_places=3)
    prix_unitaire_achat = models.DecimalField(max_digits=12, decimal_places=2)
    sous_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False)

    def save(self, *args, **kwargs):
        # Calcul automatique du sous-total
        self.sous_total = self.quantite * self.prix_unitaire_achat
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantite} {self.unite.nom} de {self.produit.nom} pour Achat #{self.achat.id}"