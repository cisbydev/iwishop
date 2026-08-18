from rest_framework import serializers
from .models import Produit, UniteVente, ProduitPrix, UNITES_PAR_DEFAUT
from categories.serializers import CategorieSerializer

class ProduitSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.ReadOnlyField(source='categorie.nom')

    class Meta:
        model = Produit
        fields = '__all__'
        read_only_fields = ['boutique']

    def create(self, validated_data):
        produit = super().create(validated_data)
        self._sync_prix(produit)
        return produit

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._sync_prix(instance)
        return instance

    def _sync_prix(self, produit):
        prix_par_nom = {'Unité': produit.prix_unitaire, 'Douzaine': produit.prix_douzaine}
        for nom, _ in UNITES_PAR_DEFAUT:
            unite = UniteVente.objects.filter(boutique=produit.boutique, nom=nom).first()
            if unite:
                ProduitPrix.objects.update_or_create(
                    produit=produit, unite=unite, defaults={'prix': prix_par_nom[nom]}
                )


class UniteVenteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UniteVente
        fields = ['id', 'nom', 'facteur_conversion']
        read_only_fields = ['boutique']


class ProduitPrixSerializer(serializers.ModelSerializer):
    unite_nom = serializers.ReadOnlyField(source='unite.nom')

    class Meta:
        model = ProduitPrix
        fields = ['id', 'unite', 'unite_nom', 'prix']