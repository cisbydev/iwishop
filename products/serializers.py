from rest_framework import serializers
from .models import Produit, UniteVente, ProduitPrix, UNITES_PAR_DEFAUT
from categories.serializers import CategorieSerializer
from tenants.serializers import CurrentBoutiqueDefault

class ProduitSerializer(serializers.ModelSerializer):
    boutique = serializers.HiddenField(default=CurrentBoutiqueDefault())
    categorie_nom = serializers.ReadOnlyField(source='categorie.nom')

    class Meta:
        model = Produit
        fields = '__all__'
        # `reference` est blank=True (auto-générée si omise, voir
        # Produit.save()) : le UniqueTogetherValidator que DRF générerait
        # automatiquement pour (boutique, reference) - audit point 9 -
        # forcerait `reference` en `required=True` malgré blank=True (DRF
        # rend requis tout champ non-lecture-seule participant à un
        # unique_together sans default), cassant le chemin historique où
        # elle est omise. On désactive cette génération automatique et on
        # valide l'unicité nous-mêmes, seulement quand une référence est
        # explicitement fournie (voir validate() ci-dessous).
        validators = []

    def validate_categorie(self, value):
        # Ne jamais supposer qu'une catégorie soumise appartient à la
        # boutique de l'appelant (même faille que MouvementStock.produit).
        if value is None:
            return value
        boutique = self.context['request'].user.profil.boutique
        if value.boutique_id != boutique.id:
            raise serializers.ValidationError("Cette catégorie n'appartient pas à votre boutique.")
        return value

    def validate(self, attrs):
        reference = attrs.get('reference', getattr(self.instance, 'reference', ''))
        if reference:
            boutique = attrs.get('boutique') or getattr(self.instance, 'boutique', None)
            queryset = Produit.objects.filter(boutique=boutique, reference=reference)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError(
                    {'reference': "Cette référence est déjà utilisée dans votre boutique."}
                )
        return attrs

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
    boutique = serializers.HiddenField(default=CurrentBoutiqueDefault())

    class Meta:
        model = UniteVente
        fields = ['id', 'boutique', 'nom', 'facteur_conversion', 'est_systeme']
        read_only_fields = ['est_systeme']


class ProduitPrixSerializer(serializers.ModelSerializer):
    unite_nom = serializers.ReadOnlyField(source='unite.nom')
    produit_nom = serializers.ReadOnlyField(source='produit.nom')

    class Meta:
        model = ProduitPrix
        fields = ['id', 'produit', 'produit_nom', 'unite', 'unite_nom', 'prix']