from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil


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


class EmployeDesactivationTests(APITestCase):
    """P2 point 16 : supprimer un employé désactive son compte
    (is_active=False) au lieu de le supprimer réellement, pour ne pas
    casser rétroactivement la traçabilité déjà en place (Vente.utilisateur
    et équivalents)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-desactivation")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.url_detail = reverse('employes-detail', args=[self.employe.id])

    def test_proprietaire_peut_desactiver(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.employe.refresh_from_db()
        self.assertFalse(self.employe.is_active)
        # Le compte existe toujours (pas de suppression réelle).
        self.assertTrue(User.objects.filter(pk=self.employe.id).exists())

    def test_proprietaire_ne_peut_pas_se_desactiver_lui_meme(self):
        """Le résultat est un 404, pas un 400 : get_queryset() exclut déjà
        est_proprietaire=True de la liste ("le propriétaire n'apparaît pas
        dans cette liste"), donc get_object() échoue avant même d'atteindre
        le garde-fou explicite de destroy() - qui est de fait inatteignable
        tant que ce filtre existe. Le résultat reste sûr (impossible de se
        désactiver soi-même) ; seul le code HTTP diffère de ce qu'on
        pourrait attendre à la lecture de destroy() seul."""
        self.client.force_authenticate(user=self.proprietaire)
        url_soi_meme = reverse('employes-detail', args=[self.proprietaire.id])
        response = self.client.delete(url_soi_meme)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_double_desactivation_refusee(self):
        self.client.force_authenticate(user=self.proprietaire)
        self.client.delete(self.url_detail)

        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_compte_desactive_ne_peut_plus_s_authentifier(self):
        self.client.force_authenticate(user=self.proprietaire)
        self.client.delete(self.url_detail)

        client_employe = APIClient()
        reponse_login = client_employe.post(
            '/api/token/', {'username': 'employe', 'password': 'pass1234'}
        )
        self.assertEqual(reponse_login.status_code, 401)

    def test_desactivation_preserve_la_tracabilite_des_ventes_passees(self):
        """Contrairement à une suppression réelle (SET_NULL), désactiver un
        employé ne doit pas faire disparaître son attribution sur les
        ventes déjà enregistrées."""
        from sales.models import Vente

        vente = Vente.objects.create(
            boutique=self.boutique, utilisateur=self.employe, montant_paye=Decimal("150"),
        )

        self.client.force_authenticate(user=self.proprietaire)
        self.client.delete(self.url_detail)

        vente.refresh_from_db()
        self.assertEqual(vente.utilisateur_id, self.employe.id)
        self.assertEqual(vente.utilisateur.username, 'employe')


class EmployeReactivationTests(APITestCase):
    """Trouvaille complémentaire au P2 point 16 : la désactivation d'un
    employé (is_active=False) n'avait aucun moyen d'être annulée - ni
    action dédiée sur EmployeViewSet, ni bouton côté frontend."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-reactivation")

        self.proprietaire = User.objects.create_user(username="proprio_react", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe_react", password="pass1234", is_active=False)
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.url_reactiver = reverse('employes-reactiver', args=[self.employe.id])

    def test_proprietaire_peut_reactiver(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.post(self.url_reactiver)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_active'])
        self.employe.refresh_from_db()
        self.assertTrue(self.employe.is_active)

    def test_compte_reactive_peut_de_nouveau_s_authentifier(self):
        self.client.force_authenticate(user=self.proprietaire)
        self.client.post(self.url_reactiver)

        client_employe = APIClient()
        reponse_login = client_employe.post(
            '/api/token/', {'username': 'employe_react', 'password': 'pass1234'}
        )
        self.assertEqual(reponse_login.status_code, 200)

    def test_double_reactivation_refusee(self):
        self.client.force_authenticate(user=self.proprietaire)
        self.client.post(self.url_reactiver)

        response = self.client.post(self.url_reactiver)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employe_ne_peut_pas_reactiver(self):
        """Un employé (même actif) n'a pas accès à EmployeViewSet du tout
        (IsOwner sur l'ensemble du ViewSet)."""
        autre_employe = User.objects.create_user(username="autre_employe_react", password="pass1234")
        Profil.objects.create(user=autre_employe, boutique=self.boutique, est_proprietaire=False)

        self.client.force_authenticate(user=autre_employe)
        response = self.client.post(self.url_reactiver)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.employe.refresh_from_db()
        self.assertFalse(self.employe.is_active)

    def test_reactivation_par_proprietaire_dune_autre_boutique_refusee(self):
        autre_boutique = Boutique.objects.create(nom="Autre Boutique", slug="autre-boutique-reactivation")
        autre_proprietaire = User.objects.create_user(username="autre_proprio_react", password="pass1234")
        Profil.objects.create(user=autre_proprietaire, boutique=autre_boutique, est_proprietaire=True)

        self.client.force_authenticate(user=autre_proprietaire)
        response = self.client.post(self.url_reactiver)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.employe.refresh_from_db()
        self.assertFalse(self.employe.is_active)


class EmployeAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir créer ou lister ses employés.
    EmployeViewSet n'utilisait pas BoutiqueScopedMixin du tout ;
    get_queryset() était fait à la main, sans `_verifier_acces()`."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-employe")
        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.proprietaire)
        self.url_list = reverse('employes-list')

    def _expirer_abonnement(self):
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

    def test_creation_refusee_si_abonnement_expire(self):
        self._expirer_abonnement()
        payload = {"username": "nouvel_employe", "password": "Xk9$mQ2vLp7z"}

        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.assertFalse(User.objects.filter(username="nouvel_employe").exists())

    def test_liste_refusee_si_abonnement_expire(self):
        self._expirer_abonnement()

        response = self.client.get(self.url_list)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))

    def test_creation_autorisee_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout doit
        continuer à créer des employés normalement."""
        payload = {"username": "nouvel_employe", "password": "Xk9$mQ2vLp7z"}

        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="nouvel_employe").exists())
