from rest_framework import serializers
from .models import Produit
from categories.serializers import CategorieSerializer

class ProduitSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.ReadOnlyField(source='categorie.nom')

    class Meta:
        model = Produit
        fields = '__all__'
        read_only_fields = ['boutique']