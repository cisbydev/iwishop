from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        if not user.is_superuser:
            from tenants.profil import profil_par_defaut

            # Multi-boutique : au moment du login, le frontend n'a pas
            # encore d'en-tête X-Boutique-Active. On exige "au moins une
            # boutique active" plutôt que "la première par id active" -
            # profil_par_defaut() priorise déjà une boutique active si
            # elle existe, donc si celle retournée est inactive, c'est
            # qu'aucune des boutiques du compte ne l'est.
            profil = profil_par_defaut(user)
            if profil is None or not profil.boutique.actif:
                raise AuthenticationFailed(
                    "Ce compte est désactivé. Contacte l'administrateur de la plateforme.",
                    code='boutique_inactive'
                )
            data['abonnement_valide'] = profil.boutique.abonnement_valide()
        return data
