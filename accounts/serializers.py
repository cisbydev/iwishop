from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password


class ChangePasswordSerializer(serializers.Serializer):
    ancien_mot_de_passe = serializers.CharField(write_only=True, required=True)
    nouveau_mot_de_passe = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    def validate_ancien_mot_de_passe(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("L'ancien mot de passe est incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['nouveau_mot_de_passe'])
        user.save()
        return user


class EmployeSerializer(serializers.ModelSerializer):
    """Utilisé pour lister les employés (ne renvoie jamais le mot de passe)."""

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'is_active', 'date_joined']
        # is_active en lecture seule (audit IwiShop point 10) : la
        # désactivation/réactivation doit obligatoirement passer par
        # EmployeViewSet.destroy()/reactiver() (règles métier dédiées -
        # ne peut pas se désactiver soi-même, message d'idempotence -
        # et non par un PATCH générique qui les contournerait silencieusement.
        read_only_fields = ['id', 'date_joined', 'is_active']


class EmployeCreateSerializer(serializers.ModelSerializer):
    """Utilisé uniquement pour la création d'un nouvel employé par le propriétaire."""

    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'password']

    def create(self, validated_data):
        from tenants.models import Profil
        from tenants.profil import boutique_de
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.is_staff = False
        user.is_superuser = False
        user.set_password(password)
        user.save()

        boutique = boutique_de(self.context['request'])
        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=False)
        return user


class MeSerializer(serializers.ModelSerializer):
    """Multi-boutique : est_proprietaire/boutique_nom reflètent le Profil
    de la boutique ACTIVE (résolue via boutique_de sur la requête en
    contexte), pas "un profil quelconque" de l'utilisateur."""
    est_proprietaire = serializers.SerializerMethodField()
    boutique_nom = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'est_proprietaire', 'boutique_nom']

    def _profil_actif(self, obj):
        request = self.context.get('request')
        if request is None:
            return None
        from tenants.profil import boutique_de
        from rest_framework.exceptions import PermissionDenied
        try:
            boutique = boutique_de(request)
        except PermissionDenied:
            return None
        return obj.profils.filter(boutique=boutique).first()

    def get_est_proprietaire(self, obj):
        profil = self._profil_actif(obj)
        return bool(profil and profil.est_proprietaire)

    def get_boutique_nom(self, obj):
        profil = self._profil_actif(obj)
        return profil.boutique.nom if profil else None
