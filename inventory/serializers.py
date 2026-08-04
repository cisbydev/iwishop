from rest_framework import serializers
from .models import MouvementStock

class MouvementStockSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')
    produit_reference = serializers.ReadOnlyField(source='produit.reference')

    class Meta:
        model = MouvementStock
        fields = '__all__'