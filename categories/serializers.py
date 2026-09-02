from rest_framework import serializers
from .models import Categorie
from tenants.serializers import CurrentBoutiqueDefault

class CategorieSerializer(serializers.ModelSerializer):
    boutique = serializers.HiddenField(default=CurrentBoutiqueDefault())

    class Meta:
        model = Categorie
        fields = '__all__'