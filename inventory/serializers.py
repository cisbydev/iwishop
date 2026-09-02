from rest_framework import serializers
from .models import MouvementStock

class MouvementStockSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')
    produit_reference = serializers.ReadOnlyField(source='produit.reference')
    utilisateur_nom = serializers.ReadOnlyField(source='utilisateur.username')

    class Meta:
        model = MouvementStock
        fields = '__all__'
        read_only_fields = ['boutique', 'utilisateur']

    def validate_produit(self, value):
        # Ne jamais supposer qu'un produit soumis appartient à la boutique
        # de l'appelant (faille identifiée : un mouvement de stock pouvait
        # être créé/modifié sur le produit d'une autre boutique).
        boutique = self.context['request'].user.profil.boutique
        if value.boutique_id != boutique.id:
            raise serializers.ValidationError("Ce produit n'appartient pas à votre boutique.")
        return value

    def validate(self, attrs):
        # Une quantité négative inverserait le sens de l'opération : une
        # ENTREE retirerait du stock, une SORTIE en ajouterait (faille
        # identifiée - audit complémentaire point 2). AJUSTEMENT n'est pas
        # concerné ici : il fixe une valeur absolue et zéro y est légitime
        # (stock réel constaté nul) - son propre contrôle (pas de valeur
        # négative) reste dans MouvementStockViewSet.perform_create().
        type_mouvement = attrs.get('type_mouvement')
        quantite = attrs.get('quantite')
        if type_mouvement in ('ENTREE', 'SORTIE') and quantite is not None and quantite <= 0:
            raise serializers.ValidationError({
                'quantite': "La quantité doit être strictement positive pour une entrée ou une sortie de stock."
            })
        return attrs