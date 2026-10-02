from decimal import Decimal
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from django.db import models
from suppliers.models import Fournisseur
from products.models import Produit
from inventory.models import MouvementStock
from sales.models import StatutPaiement, Vente
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

    # Dettes fournisseurs (achat à crédit). Mêmes choix que Vente pour que
    # le journal de caisse ventile achats et ventes sur les mêmes modes.
    # statut_paiement et montant_du sont recalculés par le service, jamais
    # saisis ; un achat comptant reste 'paye' avec montant_du = 0.
    # db_default en plus de default : default= n'est appliqué que par
    # Python, et l'ancien code, qui n'envoie pas ces colonnes, sert encore
    # les requêtes pendant le déploiement (cf. CLAUDE.md, Migrations).
    statut_paiement = models.CharField(
        max_length=20, choices=StatutPaiement.choices,
        default=StatutPaiement.PAYE, db_default=StatutPaiement.PAYE
    )
    montant_du = models.DecimalField(max_digits=12, decimal_places=2, default=0, db_default=0)
    # Argent versé au fournisseur à la création de l'achat (acompte, ou
    # montant_total pour un achat comptant). Pas de défaut : chaque chemin
    # de création doit dire ce qui a été payé. Les achats antérieurs à ce
    # champ ont été remplis avec montant_total (migration 0016), tous
    # étaient payés comptant. NOT NULL en base depuis 0019, dans un
    # déploiement séparé (expand / contract, cf. CLAUDE.md) : 0018 a d'abord
    # rempli les achats créés par l'ancien code pendant le premier.
    montant_paye = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))]
    )
    # null = "non précisé" : les achats antérieurs à ce champ ne sont jamais
    # supposés payés en espèces (même principe que Remboursement).
    mode_paiement = models.CharField(
        max_length=30, choices=Vente.MODES_PAIEMENT, null=True, blank=True
    )

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


class PaiementFournisseur(models.Model):
    """Paiement d'une dette fournisseur (achat à crédit), après la création
    de l'achat - l'acompte, lui, reste sur Achat.montant_paye. Calqué sur
    sales.Remboursement : append-only, jamais modifié ni supprimé."""
    achat = models.ForeignKey(Achat, on_delete=models.PROTECT, related_name='paiements')
    # Pas de validateur de signe : une correction porte un écart, qui peut
    # être négatif. Les bornes sont imposées par le service
    # (purchases.services.dette).
    montant = models.DecimalField(max_digits=12, decimal_places=2)
    # D9 : date du serveur, pas de paiement antidaté en v1.
    date_paiement = models.DateTimeField(auto_now_add=True)
    enregistre_par = models.ForeignKey(User, on_delete=models.PROTECT)
    # Correction append-only : une nouvelle ligne porte l'écart et pointe
    # toujours vers l'ORIGINAL, jamais vers une autre correction (cf.
    # purchases.services.dette.corriger_paiement).
    paiement_corrige = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True, related_name='corrections'
    )
    # Obligatoire quand paiement_corrige est rempli - imposé par le
    # service, pas en base.
    motif_correction = models.TextField(blank=True, default='')
    # null = "non précisé", comme Remboursement.mode_paiement. Une
    # correction reprend le mode de son original.
    mode_paiement = models.CharField(
        max_length=30, choices=Vente.MODES_PAIEMENT, null=True, blank=True
    )

    class Meta:
        verbose_name = "Paiement fournisseur"
        verbose_name_plural = "Paiements fournisseurs"
        ordering = ['date_paiement', 'id']

    def __str__(self):
        if self.paiement_corrige_id:
            return f"Correction {self.montant} du paiement #{self.paiement_corrige_id} sur Achat #{self.achat_id}"
        return f"Paiement {self.montant} sur Achat #{self.achat_id}"
