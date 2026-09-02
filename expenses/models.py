from django.db import models

class Depense(models.Model):
    STATUTS = (
        ('VALIDEE', 'Validée'),
        ('ANNULEE', 'Annulée'),
    )

    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    CATEGORIES_DEPENSE = (
        ('LOYER', 'Loyer'),
        ('TRANSPORT', 'Transport'),
        ('SALAIRE', 'Salaire'),
        ('ELECTRICITE', 'Électricité'),
        ('INTERNET', 'Internet'),
        ('AUTRE', 'Autre'),
    )

    titre = models.CharField(max_length=150)
    categorie = models.CharField(max_length=30, choices=CATEGORIES_DEPENSE, default='AUTRE')
    montant = models.DecimalField(max_digits=12, decimal_places=2)
    date_depense = models.DateField()
    description = models.TextField(blank=True, null=True)
    date_enregistrement = models.DateTimeField(auto_now_add=True)
    # Une dépense validée ne se modifie ni ne se supprime (cf.
    # DepenseViewSet) : on l'annule via un changement de statut, sans
    # jamais effacer l'historique - même principe que Vente/Achat (P0,
    # P2 point 15).
    statut = models.CharField(max_length=20, choices=STATUTS, default='VALIDEE')

    def __str__(self):
        return f"{self.titre} - {self.montant} ({self.date_depense.strftime('%d/%m/%Y')})"

    class Meta:
        verbose_name = "Dépense"
        verbose_name_plural = "Dépenses"
        ordering = ['-date_depense', '-date_enregistrement']