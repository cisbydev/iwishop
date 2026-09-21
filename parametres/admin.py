from django.contrib import admin

from .models import ParametresBoutique


@admin.register(ParametresBoutique)
class ParametresBoutiqueAdmin(admin.ModelAdmin):
    list_display = ('boutique', 'nom_boutique', 'devise', 'seuil_dette_retard_jours')
