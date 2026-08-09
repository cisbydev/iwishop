from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        if not user.is_superuser:
            if not hasattr(user, 'profil') or not user.profil.boutique.actif:
                raise AuthenticationFailed(
                    "Ce compte est désactivé. Contacte l'administrateur de la plateforme.",
                    code='boutique_inactive'
                )
        return data
