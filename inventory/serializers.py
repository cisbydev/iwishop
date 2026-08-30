from rest_framework import serializers
from .models import MouvementStock

class MouvementStockSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')
    produit_reference = serializers.ReadOnlyField(source='produit.reference')

    class Meta:
        model = MouvementStock
        fields = '__all__'
        read_only_fields = ['boutique']

    def validate_produit(self, value):
        # Ne jamais supposer qu'un produit soumis appartient à la boutique
        # de l'appelant (faille identifiée : un mouvement de stock pouvait
        # être créé/modifié sur le produit d'une autre boutique).
        boutique = self.context['request'].user.profil.boutique
        if value.boutique_id != boutique.id:
            raise serializers.ValidationError("Ce produit n'appartient pas à votre boutique.")
        return value