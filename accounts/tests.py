import itertools
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil


class JWTAccessTokenLifetimeTests(TestCase):
    """Point 10 de l'audit : ACCESS_TOKEN_LIFETIME réduit à 15 minutes.
    Vérifie le contrat backend dont dépend le rafraîchissement automatique
    de api.js (le test du comportement JS lui-même a été fait manuellement
    en direct, cf. rapport d'audit)."""

    def setUp(self):
        cache.clear()
        boutique = Boutique.objects.create(nom='Boutique JWT', slug='boutique-jwt')
        self.user = User.objects.create_user(username='jwtuser', password='motdepasse123')
        Profil.objects.create(user=self.user, boutique=boutique, est_proprietaire=True)
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def _connexion(self):
        return self.client.post('/api/token/', {'username': 'jwtuser', 'password': 'motdepasse123'})

    def _refresh_cookie(self, response):
        return response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    def _csrf_client(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.get('/api/csrf/')
        token = response.data['csrfToken']
        return client, token

    def test_access_token_dure_15_minutes(self):
        response = self._connexion()
        self.assertEqual(response.status_code, 200)

        access = AccessToken(response.data['access'])
        duree_secondes = access['exp'] - access['iat']
        self.assertAlmostEqual(duree_secondes, 15 * 60, delta=1)

    def test_refresh_token_reste_a_7_jours(self):
        response = self._connexion()

        self.assertNotIn('refresh', response.data)
        refresh = RefreshToken(self._refresh_cookie(response))
        duree_secondes = refresh['exp'] - refresh['iat']
        self.assertAlmostEqual(duree_secondes, 7 * 24 * 60 * 60, delta=1)

    def test_endpoint_refresh_emet_un_nouvel_access_token_de_15_minutes(self):
        response = self._connexion()

        refresh_response = self.client.post('/api/token/refresh/', {})

        self.assertEqual(refresh_response.status_code, 200)
        self.assertNotIn('refresh', refresh_response.data)
        nouveau_access = AccessToken(refresh_response.data['access'])
        duree_secondes = nouveau_access['exp'] - nouveau_access['iat']
        self.assertAlmostEqual(duree_secondes, 15 * 60, delta=1)

    def test_login_depose_un_refresh_httponly_hors_json(self):
        response = self._connexion()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('refresh', response.data)
        cookie = response.cookies[settings.JWT_REFRESH_COOKIE_NAME]
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], settings.JWT_REFRESH_COOKIE_SAMESITE)
        self.assertEqual(cookie['path'], settings.JWT_REFRESH_COOKIE_PATH)

    @override_settings(JWT_REFRESH_COOKIE_SECURE=True, JWT_REFRESH_COOKIE_SAMESITE='None')
    def test_cookie_respecte_secure_et_samesite_configures(self):
        response = self._connexion()
        cookie = response.cookies[settings.JWT_REFRESH_COOKIE_NAME]

        self.assertTrue(cookie['secure'])
        self.assertEqual(cookie['samesite'], 'None')

    def test_refresh_absent_ou_invalide_est_refuse(self):
        absent = APIClient().post('/api/token/refresh/', {})
        self.assertEqual(absent.status_code, status.HTTP_401_UNAUTHORIZED)

        invalide_client = APIClient()
        invalide_client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = 'invalide'
        invalide = invalide_client.post('/api/token/refresh/', {})
        self.assertEqual(invalide.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rotation_remplace_cookie_et_invalide_ancien_refresh(self):
        response = self._connexion()
        ancien_refresh = self._refresh_cookie(response)

        refresh_response = self.client.post('/api/token/refresh/', {})
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        nouveau_refresh = self._refresh_cookie(refresh_response)
        self.assertNotEqual(ancien_refresh, nouveau_refresh)

        ancien_client = APIClient()
        ancien_client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = ancien_refresh
        rejeu = ancien_client.post('/api/token/refresh/', {})
        self.assertEqual(rejeu.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rotations_successives_enregistrent_et_blacklistent_chaque_refresh(self):
        login = self._connexion()
        refresh_initial = self._refresh_cookie(login)

        refresh_1 = self.client.post('/api/token/refresh/', {})
        self.assertEqual(refresh_1.status_code, status.HTTP_200_OK)
        token_1 = self._refresh_cookie(refresh_1)
        jti_1 = RefreshToken(token_1)[api_settings.JTI_CLAIM]
        self.assertTrue(OutstandingToken.objects.filter(jti=jti_1).exists())

        refresh_2 = self.client.post('/api/token/refresh/', {})
        self.assertEqual(refresh_2.status_code, status.HTTP_200_OK)
        token_2 = self._refresh_cookie(refresh_2)
        jti_2 = RefreshToken(token_2)[api_settings.JTI_CLAIM]
        self.assertTrue(OutstandingToken.objects.filter(jti=jti_2).exists())

        refresh_3 = self.client.post('/api/token/refresh/', {})
        self.assertEqual(refresh_3.status_code, status.HTTP_200_OK)

        for token in (refresh_initial, token_1, token_2):
            client = APIClient()
            client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = token
            self.assertEqual(
                client.post('/api/token/refresh/', {}).status_code,
                status.HTTP_401_UNAUTHORIZED,
            )

        self.assertTrue(BlacklistedToken.objects.filter(token__jti=jti_1).exists())
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=jti_2).exists())

    def test_refresh_et_logout_exigent_csrf(self):
        client, csrf_token = self._csrf_client()
        login = client.post('/api/token/', {'username': 'jwtuser', 'password': 'motdepasse123'})
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        refuse = client.post('/api/token/refresh/', {})
        self.assertEqual(refuse.status_code, status.HTTP_403_FORBIDDEN)

        accepte = client.post('/api/token/refresh/', {}, HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(accepte.status_code, status.HTTP_200_OK)

        logout_refuse = client.post('/api/token/logout/', {})
        self.assertEqual(logout_refuse.status_code, status.HTTP_403_FORBIDDEN)

        logout_accepte = client.post('/api/token/logout/', {}, HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(logout_accepte.status_code, status.HTTP_204_NO_CONTENT)

    def test_endpoint_csrf_renvoie_un_token_masque_utilisable(self):
        client = APIClient(enforce_csrf_checks=True)
        csrf = client.get('/api/csrf/')

        self.assertEqual(csrf.status_code, status.HTTP_200_OK)
        self.assertTrue(csrf.data['csrfToken'])
        self.assertIn(settings.CSRF_COOKIE_NAME, csrf.cookies)

        login = client.post('/api/token/', {'username': 'jwtuser', 'password': 'motdepasse123'})
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        refresh = client.post(
            '/api/token/refresh/', {}, HTTP_X_CSRFTOKEN=csrf.data['csrfToken']
        )
        self.assertEqual(refresh.status_code, status.HTTP_200_OK)

    def test_logout_blackliste_efface_cookie_et_est_idempotent(self):
        client, csrf_token = self._csrf_client()
        login = client.post('/api/token/', {'username': 'jwtuser', 'password': 'motdepasse123'})
        refresh = self._refresh_cookie(login)

        logout = client.post('/api/token/logout/', {}, HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(logout.cookies[settings.JWT_REFRESH_COOKIE_NAME]['max-age'], 0)

        ancien_client = APIClient()
        ancien_client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = refresh
        self.assertEqual(
            ancien_client.post('/api/token/refresh/', {}).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            client.post('/api/token/logout/', {}, HTTP_X_CSRFTOKEN=csrf_token).status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_compte_desactive_est_refuse_au_refresh(self):
        self._connexion()
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])

        response = self.client.post('/api/token/refresh/', {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_boutique_inactive_conserve_le_comportement_refresh_existant(self):
        self._connexion()
        self.user.profil.boutique.actif = False
        self.user.profil.boutique.save(update_fields=['actif'])

        response = self.client.post('/api/token/refresh/', {})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_superuser_sans_profil_peut_login_et_refresh(self):
        superuser = User.objects.create_superuser(
            username='admin-jwt', password='motdepasse123', email='admin@example.com'
        )
        client = APIClient()
        login = client.post('/api/token/', {'username': 'admin-jwt', 'password': 'motdepasse123'})

        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn('access', login.data)
        self.assertNotIn('refresh', login.data)
        self.assertEqual(client.post('/api/token/refresh/', {}).status_code, status.HTTP_200_OK)

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
        access = AccessToken(response.data['access'])
        access.set_exp(lifetime=timezone.timedelta(seconds=-1))

        client_expire = APIClient()
        client_expire.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        echec_initial = client_expire.get('/api/accounts/me/')
        self.assertEqual(echec_initial.status_code, 401)

        refresh_response = self.client.post('/api/token/refresh/', {})
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

    def test_patch_is_active_ignore(self):
        """Audit IwiShop point 10 : is_active est en lecture seule sur
        EmployeSerializer - un PATCH générique ne doit plus pouvoir
        réactiver (ni désactiver) un compte, seuls reactiver()/destroy()
        le peuvent (règles métier dédiées : auto-désactivation interdite,
        idempotence)."""
        self.client.force_authenticate(user=self.proprietaire)
        url_detail = reverse('employes-detail', args=[self.employe.id])

        response = self.client.patch(url_detail, {"is_active": True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.employe.refresh_from_db()
        self.assertFalse(self.employe.is_active)


class EmployeAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir créer, désactiver ou réactiver un employé
    (la liste reste lisible - contrôle scindé lecture/écriture).
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

    def test_liste_autorisee_si_abonnement_expire(self):
        """Lecture toujours permise, même abonnement expiré (contrôle
        scindé lecture/écriture)."""
        self._expirer_abonnement()

        response = self.client.get(self.url_list)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_creation_autorisee_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout doit
        continuer à créer des employés normalement."""
        payload = {"username": "nouvel_employe", "password": "Xk9$mQ2vLp7z"}

        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="nouvel_employe").exists())

    def test_desactivation_refusee_si_abonnement_expire(self):
        """destroy() (désactivation) n'est plus protégé implicitement par
        get_queryset() (lecture toujours permise) : vérifie l'appel
        explicite ajouté, sans quoi la faille serait réintroduite."""
        employe = User.objects.create_user(username="employe_abo", password="pass1234")
        Profil.objects.create(user=employe, boutique=self.boutique, est_proprietaire=False)
        self._expirer_abonnement()

        response = self.client.delete(reverse('employes-detail', args=[employe.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        employe.refresh_from_db()
        self.assertTrue(employe.is_active)

    def test_reactivation_refusee_si_abonnement_expire(self):
        """reactiver() n'est plus protégé implicitement par get_queryset()
        (lecture toujours permise) : vérifie l'appel explicite ajouté,
        sans quoi la faille serait réintroduite."""
        employe = User.objects.create_user(username="employe_abo2", password="pass1234", is_active=False)
        Profil.objects.create(user=employe, boutique=self.boutique, est_proprietaire=False)
        self._expirer_abonnement()

        response = self.client.post(reverse('employes-reactiver', args=[employe.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        employe.refresh_from_db()
        self.assertFalse(employe.is_active)


class LoginThrottlingTests(APITestCase):
    """Durcissement pré-lancement (P2) : POST /api/token/ n'avait aucun
    throttling - un brute-force applicatif n'était limité par rien
    (DEFAULT_THROTTLE_CLASSES absent de REST_FRAMEWORK, aucun
    throttle_classes sur CustomTokenObtainPairView). Deux dimensions
    complémentaires (cf. accounts.throttling) : IP cliente (10/min) et
    identifiant normalisé (5/min), chacune indépendamment vérifiable via
    429. Ni l'une ni l'autre ne touche User.is_active ni n'ajoute de
    compteur métier en base - cf. tests dédiés ci-dessous."""

    LIMITE_IP = 10
    LIMITE_USERNAME = 5

    def setUp(self):
        # Isolation entre tests (LocMemCache est partagé pour tout le
        # process de test - sans ce clear(), les compteurs d'un test
        # contamineraient le suivant et produiraient des tests flaky).
        cache.clear()

        # SimpleRateThrottle utilise time.time() en interne pour sa
        # fenêtre glissante. Sur cet environnement, une requête de login
        # (hachage de mot de passe compris) peut prendre plusieurs
        # secondes réelles - largement de quoi laisser la fenêtre de 60s
        # s'écouler pendant qu'un test enchaîne 10-11 requêtes, et
        # empêcher le seuil d'être jamais atteint (constaté : échec
        # reproductible sans rapport avec la logique de throttling
        # elle-même). On fige l'horloge INTERNE DU THROTTLE (jamais
        # celle de Python/Django en général) sur un temps simulé qui
        # n'avance que de quelques millisecondes par appel : la fenêtre
        # de 60s réelle ne peut alors jamais s'écouler pendant un test,
        # quelle que soit la lenteur réelle de l'environnement.
        horloge_simulee = itertools.count(0.0, 0.01)
        patcher_horloge = mock.patch(
            'rest_framework.throttling.SimpleRateThrottle.timer',
            new=staticmethod(lambda: next(horloge_simulee)),
        )
        patcher_horloge.start()
        self.addCleanup(patcher_horloge.stop)

        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-throttle")
        self.user = User.objects.create_user(username="cible_throttle", password="motdepasse_correct")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.superuser = User.objects.create_superuser(
            username="admin_throttle", password="motdepasse_admin", email="admin@example.com"
        )

    def tearDown(self):
        cache.clear()

    def _login(self, username, password, ip=None, client=None):
        client = client or APIClient()
        extra = {'HTTP_X_FORWARDED_FOR': ip} if ip else {}
        return client.post('/api/token/', {'username': username, 'password': password}, **extra)

    def test_tentatives_sous_la_limite_retournent_echec_normal(self):
        """Quelques mauvaises tentatives, sous les deux limites : réponse
        d'échec d'authentification classique, jamais 429."""
        for _ in range(3):
            response = self._login('cible_throttle', 'mauvais_mot_de_passe', ip='10.0.0.1')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_connexion_valide_fonctionne_avant_depassement(self):
        """Une connexion valide reste possible avant tout dépassement, et
        renvoie des tokens JWT exploitables."""
        for _ in range(2):
            self._login('cible_throttle', 'mauvais_mot_de_passe', ip='10.0.0.2')

        response = self._login('cible_throttle', 'motdepasse_correct', ip='10.0.0.2')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertNotIn('refresh', response.data)
        access = AccessToken(response.data['access'])
        self.assertEqual(str(access['user_id']), str(self.user.id))
        refresh = RefreshToken(response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value)
        self.assertEqual(str(refresh['user_id']), str(self.user.id))

    def test_depassement_limite_ip_retourne_429(self):
        """LIMITE_IP tentatives depuis la même IP, avec un identifiant
        DIFFÉRENT à chaque fois (pour ne jamais atteindre la limite
        username, plus basse, et isoler proprement la dimension IP) :
        toutes passent sous le seuil, la suivante est 429."""
        ip = '20.0.0.1'
        for i in range(self.LIMITE_IP):
            response = self._login(f'utilisateur_inexistant_{i}', 'peu_importe', ip=ip)
            self.assertNotEqual(
                response.status_code, status.HTTP_429_TOO_MANY_REQUESTS,
                f"Tentative {i + 1}/{self.LIMITE_IP} n'aurait pas dû être throttlée."
            )

        response = self._login('utilisateur_inexistant_suivant', 'peu_importe', ip=ip)

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_depassement_limite_username_retourne_429(self):
        """LIMITE_USERNAME tentatives sur le MÊME identifiant, chacune
        depuis une IP DIFFÉRENTE (pour ne jamais atteindre la limite IP,
        plus haute, et isoler proprement la dimension username) : toutes
        passent sous le seuil, la suivante est 429 - alors même que la
        nouvelle IP utilisée n'a, elle, servi qu'une seule fois."""
        for i in range(self.LIMITE_USERNAME):
            response = self._login('cible_throttle', 'mauvais_mot_de_passe', ip=f'30.0.0.{i}')
            self.assertNotEqual(
                response.status_code, status.HTTP_429_TOO_MANY_REQUESTS,
                f"Tentative {i + 1}/{self.LIMITE_USERNAME} n'aurait pas dû être throttlée."
            )

        response = self._login('cible_throttle', 'mauvais_mot_de_passe', ip='30.0.0.99')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_quota_username_isole_entre_utilisateurs_differents(self):
        """Épuiser le quota d'un identifiant ne doit pas affecter un autre
        identifiant, même en cas de collision de casse/espaces (normalisation)."""
        autre_user = User.objects.create_user(username="autre_cible", password="motdepasse_correct")
        Profil.objects.create(user=autre_user, boutique=self.boutique, est_proprietaire=False)

        for i in range(self.LIMITE_USERNAME):
            self._login('cible_throttle', 'mauvais_mot_de_passe', ip=f'40.0.0.{i}')
        # Le quota de 'cible_throttle' est épuisé.
        epuise = self._login('cible_throttle', 'mauvais_mot_de_passe', ip='40.0.0.99')
        self.assertEqual(epuise.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # 'autre_cible' (autre utilisateur) doit rester totalement libre.
        response = self._login('autre_cible', 'motdepasse_correct', ip='40.0.0.98')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Une variante de casse/espaces du MÊME identifiant doit en
        # revanche être reconnue comme le même compte (normalisation) et
        # donc rester throttlée.
        variante = self._login('  Cible_Throttle  ', 'motdepasse_correct', ip='40.0.0.97')
        self.assertEqual(variante.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_quota_ip_isole_entre_ip_differentes(self):
        """Épuiser le quota d'une IP ne doit pas affecter une autre IP."""
        ip_attaquant = '50.0.0.1'
        for i in range(self.LIMITE_IP):
            self._login(f'inexistant_{i}', 'peu_importe', ip=ip_attaquant)
        epuise = self._login('inexistant_suivant', 'peu_importe', ip=ip_attaquant)
        self.assertEqual(epuise.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Une IP différente doit pouvoir se connecter normalement.
        response = self._login('cible_throttle', 'motdepasse_correct', ip='50.0.0.2')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_repli_sur_remote_addr_si_pas_de_x_forwarded_for(self):
        """Sans X-Forwarded-For (dev local, requête directe), le throttle
        IP doit quand même fonctionner via REMOTE_ADDR - et pas planter
        ni désactiver silencieusement le throttling. Identifiant
        différent à chaque tentative pour isoler proprement la dimension
        IP (REMOTE_ADDR, constant pour ce client de test) de la
        dimension username."""
        client = APIClient()
        for i in range(self.LIMITE_IP):
            response = client.post(
                '/api/token/', {'username': f'repli_{i}', 'password': 'mauvais'}
            )
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        response = client.post(
            '/api/token/', {'username': 'repli_suivant', 'password': 'mauvais'}
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_superuser_peut_toujours_se_connecter(self):
        response = self._login('admin_throttle', 'motdepasse_admin', ip='60.0.0.1')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_compte_desactive_toujours_refuse_avec_throttling_actif(self):
        """Non-régression : la vérification boutique active/compte
        désactivé (CustomTokenObtainPairSerializer.validate) continue de
        fonctionner normalement (401, pas 429) avec le throttling en place."""
        employe = User.objects.create_user(username="employe_throttle", password="pass1234", is_active=False)
        Profil.objects.create(user=employe, boutique=self.boutique, est_proprietaire=False)

        response = self._login('employe_throttle', 'pass1234', ip='70.0.0.1')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_mot_de_passe_absent_du_cache(self):
        """Les clés de cache posées par le throttling (IP + username) ne
        doivent jamais contenir le mot de passe soumis - preuve directe :
        SimpleRateThrottle ne stocke que des horodatages (floats), jamais
        de chaîne de caractères, donc structurellement aucun mot de passe
        ne peut y transiter."""
        from accounts.throttling import LoginIPRateThrottle, LoginUsernameRateThrottle
        import hashlib

        mot_de_passe_distinctif = "MotDePasseTresDistinctifXYZ_98765"
        self._login('cible_throttle', mot_de_passe_distinctif, ip='80.0.0.1')

        cle_ip = LoginIPRateThrottle.cache_format % {'scope': 'login_ip', 'ident': '80.0.0.1'}
        cle_username = LoginUsernameRateThrottle.cache_format % {
            'scope': 'login_username',
            'ident': hashlib.sha256('cible_throttle'.encode('utf-8')).hexdigest(),
        }

        valeur_ip = cache.get(cle_ip)
        valeur_username = cache.get(cle_username)

        self.assertIsNotNone(valeur_ip)
        self.assertIsNotNone(valeur_username)
        for valeur in (valeur_ip, valeur_username):
            self.assertIsInstance(valeur, list)
            for entree in valeur:
                self.assertIsInstance(entree, float)
            self.assertNotIn(mot_de_passe_distinctif, str(valeur))
