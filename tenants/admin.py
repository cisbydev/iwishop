from django.contrib import admin
from .models import Boutique, Profil, DemandeAcces, AccesSupport

admin.site.register(Boutique)
admin.site.register(Profil)
admin.site.register(DemandeAcces)

@admin.register(AccesSupport)
class AccesSupportAdmin(admin.ModelAdmin):
    list_display = ['admin', 'boutique', 'date_acces']
