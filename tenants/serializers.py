from rest_framework import serializers
from .models import DemandeAcces, Boutique

class DemandeAccesSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeAcces
        fields = ['id', 'nom_contact', 'email', 'telephone', 'nom_boutique_souhaite', 'statut', 'date_demande']
        read_only_fields = ['id', 'statut', 'date_demande']

class BoutiqueSerializer(serializers.ModelSerializer):
    nombre_membres = serializers.SerializerMethodField()

    class Meta:
        model = Boutique
        fields = ['id', 'nom', 'slug', 'actif', 'date_creation', 'nombre_membres']

    def get_nombre_membres(self, obj):
        return obj.membres.count()
