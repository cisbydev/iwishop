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
        read_only_fields = ['id', 'date_joined']


class EmployeCreateSerializer(serializers.ModelSerializer):
    """Utilisé uniquement pour la création d'un nouvel employé par le propriétaire."""

    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.is_staff = False
        user.is_superuser = False
        user.set_password(password)
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'is_superuser']
