from django.db import models
from django.contrib.auth.models import User
from products.models import Produit
from inventory.models import MouvementStock
import uuid

class Vente(models.Model):
    MODES_PAIEMENT = (
        ('ESPECES', 'Espèces'),
        ('MOBILE_MONEY', 'Mobile Money'),
        ('CARTE', 'Carte bancaire'),
        ('AUTRE', 'Autre'),
    )
    STATUTS = (
        ('VALIDEE', 'Validée'),
        ('ANNULEE', 'Annulée'),
    )

    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    numero = models.CharField(max_length=50, unique=True, editable=False)
    date_vente = models.DateTimeField(auto_now_add=True)
    client = models.CharField(max_length=150, blank=True, null=True, default="Client comptoir")

    montant_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    remise = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    montant_net = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    montant_paye = models.DecimalField(max_digits=12, decimal_places=2)
    monnaie_rendue = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    mode_paiement = models.CharField(max_length=30, choices=MODES_PAIEMENT, default='ESPECES')
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    # Une vente validée ne se modifie ni ne se supprime (cf. VenteViewSet) :
    # on l'annule via une écriture inverse qui restaure le stock et marque
    # ce statut, sans jamais effacer l'historique.
    statut = models.CharField(max_length=20, choices=STATUTS, default='VALIDEE')

    def save(self, *args, **kwargs):
        if not self.numero:
            # Générer un numéro de vente unique basé sur l'UUID court
            self.numero = f"V-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Vente {self.numero} - {self.montant_net} ({self.date_vente.strftime('%d/%m/%Y %H:%M')})"

    class Meta:
        verbose_name = "Vente"
        verbose_name_plural = "Ventes"
        ordering = ['-date_vente']

class LigneVente(models.Model):
    TYPES_VENTE = (
        ('UNITE', 'Unité'),
        ('DOUZAINE', 'Douzaine'),
        ('PERSONNALISE', 'Personnalisé'),
    )

    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name='lignes')
    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name='lignes_vente')
    quantite = models.IntegerField()
    type_vente = models.CharField(max_length=20, choices=TYPES_VENTE, default='UNITE')
    unite = models.ForeignKey('products.UniteVente', on_delete=models.PROTECT, related_name='lignes_vente')
    facteur_conversion_applique = models.DecimalField(max_digits=10, decimal_places=3)
    prix_applique = models.DecimalField(max_digits=12, decimal_places=2)
    sous_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False)

    def save(self, *args, **kwargs):
        self.sous_total = self.quantite * self.prix_applique
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantite} {self.type_vente}(s) de {self.produit.nom} (Vente {self.vente.numero})"