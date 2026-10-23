from rest_framework import serializers
from .models import Categorie
from tenants.serializers import CurrentBoutiqueDefault

class CategorieSerializer(serializers.ModelSerializer):
    boutique = serializers.HiddenField(default=CurrentBoutiqueDefault())

    class Meta:
        model = Categorie
        fields = '__all__'
        # L'image s'envoie par POST/DELETE categories/{id}/image/ (contrôlée
        # et ré-encodée) ; ici, seulement son URL.
        read_only_fields = ['image']