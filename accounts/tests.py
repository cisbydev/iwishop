from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from tenants.models import Boutique, Profil


class JWTAccessTokenLifetimeTests(TestCase):
    """Point 10 de l'audit : ACCESS_TOKEN_LIFETIME réduit à 15 minutes.
    Vérifie le contrat backend dont dépend le rafraîchissement automatique
    de api.js (le test du comportement JS lui-même a été fait manuellement
    en direct, cf. rapport d'audit)."""

    def setUp(self):
        boutique = Boutique.objects.create(nom='Boutique JWT', slug='boutique-jwt')
        self.user = User.objects.create_user(username='jwtuser', password='motdepasse123')
        Profil.objects.create(user=self.user, boutique=boutique, est_proprietaire=True)
        self.client = APIClient()

    def _connexion(self):
        return self.client.post('/api/token/', {'username': 'jwtuser', 'password': 'motdepasse123'})

    def test_access_token_dure_15_minutes(self):
        response = self._connexion()
        self.assertEqual(response.status_code, 200)

        access = AccessToken(response.data['access'])
        duree_secondes = access['exp'] - access['iat']
        self.assertAlmostEqual(duree_secondes, 15 * 60, delta=1)

    def test_refresh_token_reste_a_7_jours(self):
        response = self._connexion()

        refresh = RefreshToken(response.data['refresh'])
        duree_secondes = refresh['exp'] - refresh['iat']
        self.assertAlmostEqual(duree_secondes, 7 * 24 * 60 * 60, delta=1)

    def test_endpoint_refresh_emet_un_nouvel_access_token_de_15_minutes(self):
        response = self._connexion()
        refresh_token = response.data['refresh']

        refresh_response = self.client.post('/api/token/refresh/', {'refresh': refresh_token})

        self.assertEqual(refresh_response.status_code, 200)
        nouveau_access = AccessToken(refresh_response.data['access'])
        duree_secondes = nouveau_access['exp'] - nouveau_access['iat']
        self.assertAlmostEqual(duree_secondes, 15 * 60, delta=1)

    def test_access_token_expire_est_rejete_par_un_endpoint_protege(self):
        response = self._connexion()
        access = AccessToken(response.data['access'])
        access.set_exp(lifetime=timezone.timedelta(seconds=-1))

        client_expire = APIClient()
        client_expire.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        protected_response = client_expire.get('/api/accounts/me/')

        self.assertEqual(protected_response.status_code, 401)

    def test_apres_expiration_le_refresh_token_permet_de_continuer(self):
        """Reproduit exactement ce que fait l'intercepteur de api.js : sur un
        401, appeler token/refresh/ puis rejouer la requête d'origine avec le
        nouveau token - sans jamais redemander de mot de passe."""
        response = self._connexion()
        refresh_token = response.data['refresh']
        access = AccessToken(response.data['access'])
        access.set_exp(lifetime=timezone.timedelta(seconds=-1))

        client_expire = APIClient()
        client_expire.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        echec_initial = client_expire.get('/api/accounts/me/')
        self.assertEqual(echec_initial.status_code, 401)

        refresh_response = self.client.post('/api/token/refresh/', {'refresh': refresh_token})
        self.assertEqual(refresh_response.status_code, 200)

        client_expire.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh_response.data['access']}")
        rejeu = client_expire.get('/api/accounts/me/')
        self.assertEqual(rejeu.status_code, 200)
