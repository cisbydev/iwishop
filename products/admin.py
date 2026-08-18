from django.contrib import admin
from .models import UniteVente, ProduitPrix


@admin.register(UniteVente)
class UniteVenteAdmin(admin.ModelAdmin):
    list_display = ['nom', 'boutique', 'facteur_conversion']
    list_filter = ['boutique']
    search_fields = ['nom', 'boutique__nom']


@admin.register(ProduitPrix)
class ProduitPrixAdmin(admin.ModelAdmin):
    list_display = ['produit', 'unite', 'prix']
    list_filter = ['unite__boutique']
    search_fields = ['produit__nom', 'unite__nom']
