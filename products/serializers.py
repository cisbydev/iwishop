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


class CurrentBoutiqueDefault:
    """Injecte la boutique de l'utilisateur courant, invisible côté client.
    Nécessaire (pas juste read_only) pour que DRF génère le
    UniqueTogetherValidator sur (boutique, nom) : un champ read_only sans
    default n'est jamais inclus dans validated_data ni dans le calcul du
    validateur (voir ModelSerializer.get_unique_together_validators)."""
    requires_context = True

    def __call__(self, serializer_field):
        return serializer_field.context['request'].user.profil.boutique

    def __repr__(self):
        return '%s()' % self.__class__.__name__


class UniteVenteSerializer(serializers.ModelSerializer):
    boutique = serializers.HiddenField(default=CurrentBoutiqueDefault())

    class Meta:
        model = UniteVente
        fields = ['id', 'boutique', 'nom', 'facteur_conversion']


class ProduitPrixSerializer(serializers.ModelSerializer):
    unite_nom = serializers.ReadOnlyField(source='unite.nom')

    class Meta:
        model = ProduitPrix
        fields = ['id', 'unite', 'unite_nom', 'prix']