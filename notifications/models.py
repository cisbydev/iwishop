from django.db import models


class TypeNotification(models.TextChoices):
    STOCK_BAS = 'stock_bas', 'Stock bas'
    DETTE_RETARD = 'dette_retard', 'Dette en retard'


class DestinataireNotification(models.TextChoices):
    TOUS = 'tous', 'Propriétaire et employés'
    PROPRIETAIRE = 'proprietaire', 'Propriétaire uniquement'


class Notification(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE, related_name='notifications')
    type_notification = models.CharField(max_length=20, choices=TypeNotification.choices)
    message = models.CharField(max_length=255)
    # CASCADE (pas PROTECT) : contrairement à LigneVente/Remboursement, une
    # notification n'est pas une donnée d'audit financier - si le produit ou
    # la vente concernée disparaît, l'alerte n'a plus de sens et disparaît
    # avec elle plutôt que de bloquer sa suppression.
    produit = models.ForeignKey(
        'products.Produit', null=True, blank=True, on_delete=models.CASCADE, related_name='notifications'
    )
    vente = models.ForeignKey(
        'sales.Vente', null=True, blank=True, on_delete=models.CASCADE, related_name='notifications'
    )
    destinataire_role = models.CharField(max_length=20, choices=DestinataireNotification.choices)
    date_creation = models.DateTimeField(auto_now_add=True)
    lue = models.BooleanField(default=False)

    class Meta:
        ordering = ['-date_creation']

    def __str__(self):
        return f"{self.get_type_notification_display()} - {self.message}"
