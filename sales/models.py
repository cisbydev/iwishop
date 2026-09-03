from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
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
    # >= 0 - une remise négative augmenterait le montant net au lieu de le
    # réduire (audit point 3). Le plafond (remise <= montant_total) ne peut
    # pas être exprimé par un validateur de champ puisqu'il dépend du total
    # calculé à partir des lignes : voir VenteSerializer.create().
    remise = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(Decimal('0'))])
    montant_net = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    # >= 0 - un montant payé négatif combiné à une remise excessive
    # permettait de faire ressortir une "monnaie rendue" positive sur une
    # vente au montant net négatif (contournement démontré, audit point 3).
    montant_paye = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
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
    # PROTECT (pas CASCADE) : supprimer un Produit ne doit jamais effacer
    # silencieusement l'historique des ventes qui le référencent - même
    # principe que UniteVente ci-dessous, jusqu'ici appliqué au produit
    # lui-même mais pas répliqué ici (P2 point 15, faille trouvée).
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name='lignes_vente')
    # >= 0 - déjà validé côté serializer (audit complémentaire point 2) ;
    # validateur de modèle en plus, défense en profondeur contre une
    # écriture directe (ex. admin Django).
    quantite = models.IntegerField(validators=[MinValueValidator(0)])
    type_vente = models.CharField(max_length=20, choices=TYPES_VENTE, default='UNITE')
    unite = models.ForeignKey('products.UniteVente', on_delete=models.PROTECT, related_name='lignes_vente')
    facteur_conversion_applique = models.DecimalField(max_digits=10, decimal_places=3)
    prix_applique = models.DecimalField(max_digits=12, decimal_places=2)
    # Coût de revient unitaire figé au moment de la vente (Produit.prix_achat
    # au moment de la création de la ligne), même principe que prix_applique
    # et facteur_conversion_applique ci-dessus : Produit.prix_achat change à
    # chaque nouvel achat (dernier prix payé au fournisseur - voir
    # purchases.serializers.AchatSerializer.create()) et ne doit jamais être
    # relu pour recalculer le bénéfice d'une vente déjà réalisée (bug P1
    # corrigé - bénéfice historique qui se déformait rétroactivement).
    #
    # Nullable en base : les lignes créées avant ce correctif n'ont pas de
    # coût historique connu et NE SONT PAS backfillées avec la valeur
    # actuelle de Produit.prix_achat - ce serait recréer exactement le bug
    # qu'on corrige (une donnée reconstituée n'est pas une donnée
    # historique). Ces lignes restent NULL indéfiniment ; les calculs de
    # bénéfice (dashboard/reports) retombent explicitement sur
    # Produit.prix_achat pour elles uniquement, comme avant ce correctif -
    # limite assumée et documentée pour les ventes antérieures à la migration.
    prix_achat_unitaire = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal('0'))],
    )
    sous_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False)

    def save(self, *args, **kwargs):
        self.sous_total = self.quantite * self.prix_applique
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantite} {self.type_vente}(s) de {self.produit.nom} (Vente {self.vente.numero})"