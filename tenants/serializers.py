from rest_framework import serializers
from .models import DemandeAcces

class DemandeAccesSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeAcces
        fields = ['id', 'nom_contact', 'email', 'telephone', 'nom_boutique_souhaite', 'statut', 'date_demande']
        read_only_fields = ['id', 'statut', 'date_demande']
