from django.db import models
from tenants.validators import extensions_image_autorisees, valider_taille_image

class ParametresBoutique(models.Model):
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    nom_boutique = models.CharField(max_length=150, default="iwiShop")
    # Extensions + taille bornées (audit point 10) - le contenu réel est
    # déjà vérifié comme étant une image décodable par Pillow (ImageField),
    # mais rien ne limitait jusqu'ici le format ou le poids du fichier.
    logo = models.ImageField(
        upload_to='logos/', blank=True, null=True,
        validators=[extensions_image_autorisees, valider_taille_image],
    )
    adresse = models.TextField(blank=True, null=True)
    telephone = models.CharField(max_length=30, blank=True, null=True)
    devise = models.CharField(max_length=10, default="FCFA")
    tva = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    # default=7 : préserve le comportement de l'ancienne constante globale
    # notifications.services.SEUIL_DETTE_RETARD_JOURS pour toutes les
    # boutiques existantes, sans backfill nécessaire.
    seuil_dette_retard_jours = models.PositiveIntegerField(default=7)
    # default=30 : quota de départ raisonnable - vérifié par
    # assistant.views.AssistantView AVANT tout appel à l'API Anthropic
    # (facturée au token), pour éviter une facture imprévue.
    limite_questions_assistant_par_jour = models.PositiveIntegerField(default=30)

    def __str__(self):
        return self.nom_boutique

    class Meta:
        verbose_name = "Paramètre de la boutique"
        verbose_name_plural = "Paramètres de la boutique"