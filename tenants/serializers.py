from rest_framework import serializers
from .models import DemandeAcces, Boutique, AccesSupport, FormuleAbonnement

class DemandeAccesSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeAcces
        fields = ['id', 'nom_contact', 'email', 'telephone', 'nom_boutique_souhaite', 'statut', 'date_demande']
        read_only_fields = ['id', 'statut', 'date_demande']

class BoutiqueSerializer(serializers.ModelSerializer):
    nombre_membres = serializers.SerializerMethodField()
    a_abonnement = serializers.SerializerMethodField()
    statut = serializers.SerializerMethodField()
    jours_restants = serializers.SerializerMethodField()
    date_fin = serializers.SerializerMethodField()

    class Meta:
        model = Boutique
        fields = [
            'id', 'nom', 'slug', 'actif', 'date_creation', 'nombre_membres',
            'a_abonnement', 'statut', 'jours_restants', 'date_fin',
        ]

    def get_nombre_membres(self, obj):
        return obj.membres.count()

    def get_a_abonnement(self, obj):
        return obj.info_abonnement()['a_abonnement']

    def get_statut(self, obj):
        return obj.info_abonnement()['statut']

    def get_jours_restants(self, obj):
        return obj.info_abonnement()['jours_restants']

    def get_date_fin(self, obj):
        return obj.info_abonnement()['date_fin']

class FormuleAbonnementSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormuleAbonnement
        fields = ['id', 'nom', 'duree_jours', 'prix']

class AccesSupportSerializer(serializers.ModelSerializer):
    admin_username = serializers.ReadOnlyField(source='admin.username')

    class Meta:
        model = AccesSupport
        fields = ['id', 'admin_username', 'date_acces']
