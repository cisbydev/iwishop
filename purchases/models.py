from decimal import Decimal
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
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
    # Employé ayant enregistré l'achat - traçabilité (P2 point 16). SET_NULL
    # comme Vente.utilisateur : si le compte est un jour réellement supprimé
    # (hors flux normal, qui désactive désormais - cf. EmployeViewSet),
    # l'historique de l'achat ne doit jamais être effacé pour autant.
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
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
    # PROTECT (pas CASCADE) : supprimer un Produit ne doit jamais effacer
    # silencieusement l'historique des achats qui le référencent - même
    # principe que UniteVente ci-dessous, jusqu'ici appliqué au produit
    # lui-même mais pas répliqué ici (P2 point 15, faille trouvée).
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name='lignes_achat')
    # >= 0 - déjà validé côté serializer (audit complémentaire point 2) ;
    # validateur de modèle en plus, défense en profondeur contre une
    # écriture directe (ex. admin Django).
    quantite = models.IntegerField(validators=[MinValueValidator(0)])
    unite = models.ForeignKey('products.UniteVente', on_delete=models.PROTECT, related_name='lignes_achat')
    facteur_conversion_applique = models.DecimalField(max_digits=10, decimal_places=3)
    # >= 0 - un prix d'achat négatif n'a pas de sens et fausserait le stock
    # valorisé et le calcul du bénéfice (audit point 3).
    prix_unitaire_achat = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    sous_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False)

    def save(self, *args, **kwargs):
        # Calcul automatique du sous-total
        self.sous_total = self.quantite * self.prix_unitaire_achat
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantite} {self.unite.nom} de {self.produit.nom} pour Achat #{self.achat.id}"