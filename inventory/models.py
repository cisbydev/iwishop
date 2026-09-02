from django.contrib.auth.models import User
from django.db import models
from products.models import Produit

class MouvementStock(models.Model):
    TYPES_MOUVEMENT = (
        ('ENTREE', 'Entrée de stock'),
        ('SORTIE', 'Sortie de stock'),
        ('AJUSTEMENT', 'Ajustement d\'inventaire'),
    )

    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    # PROTECT (pas CASCADE) : supprimer un Produit ne doit jamais effacer
    # silencieusement l'historique de ses mouvements de stock (P2 point 15,
    # faille trouvée - même principe déjà appliqué à UniteVente ailleurs).
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name='mouvements')
    # Employé ayant effectué le mouvement - traçabilité (P2 point 16).
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
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