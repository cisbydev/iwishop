from django.contrib import admin
from .models import Boutique, Profil, DemandeAcces, AccesSupport, FormuleAbonnement, Abonnement, PaiementAbonnement

admin.site.register(Boutique)
admin.site.register(Profil)
admin.site.register(DemandeAcces)

@admin.register(AccesSupport)
class AccesSupportAdmin(admin.ModelAdmin):
    list_display = ['admin', 'boutique', 'date_acces']

@admin.register(FormuleAbonnement)
class FormuleAbonnementAdmin(admin.ModelAdmin):
    list_display = ['nom', 'duree_jours', 'prix', 'actif']
    list_editable = ['actif']

@admin.register(Abonnement)
class AbonnementAdmin(admin.ModelAdmin):
    list_display = ['boutique', 'formule', 'date_debut', 'date_fin', 'statut', 'alerte_envoyee']
    list_filter = ['statut']
    search_fields = ['boutique__nom']

@admin.register(PaiementAbonnement)
class PaiementAbonnementAdmin(admin.ModelAdmin):
    list_display = ['boutique', 'formule', 'statut', 'invoice_token', 'date_creation']
    list_filter = ['statut']
    search_fields = ['boutique__nom', 'invoice_token']
