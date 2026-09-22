import hashlib
import itertools
import threading
import time
from decimal import Decimal
from unittest import skipUnless
from unittest.mock import Mock, patch

from decouple import config
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import connection, connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from . import paydunya
from .models import Abonnement, Boutique, DemandeAcces, FormuleAbonnement, PaiementAbonnement, Profil
from .services import confirmer_paiement
from products.models import UniteVente


def hash_paydunya_valide():
    """Reproduit exactement le calcul de paydunya.hash_valide(), pour que les
    tests webhook envoient un hash accepté sans dupliquer de secret en dur."""
    master_key = config('PAYDUNYA_MASTER_KEY')
    return hashlib.sha512(master_key.encode('utf-8')).hexdigest()


class DemandeAccesThrottlingTests(TestCase):
    """Le formulaire public est limité par IP sans affecter les autres
    routes publiques. Le cache est isolé entre chaque test."""

    LIMITE = 5

    def setUp(self):
        cache.clear()
        horloge_simulee = itertools.count(0.0, 0.01)
        patcher_horloge = patch(
            'rest_framework.throttling.SimpleRateThrottle.timer',
            new=staticmethod(lambda: next(horloge_simulee)),
        )
        patcher_horloge.start()
        self.addCleanup(patcher_horloge.stop)
        self.addCleanup(cache.clear)
        self.client = APIClient()

    def _donnees(self, index=0):
        return {
            'nom_contact': f'Commerçant {index}',
            'email': f'commercant{index}@example.com',
            'telephone': f'700000{index:02d}',
            'nom_boutique_souhaite': f'Boutique {index}',
        }

    @patch('tenants.views.notifier_nouvelle_demande')
    def test_premiere_demande_valide_cree_la_demande_et_notifie(self, mock_notifier):
        response = self.client.post('/api/tenants/demande-acces/', self._donnees())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DemandeAcces.objects.count(), 1)
        demande = DemandeAcces.objects.get()
        self.assertEqual(demande.email, 'commercant0@example.com')
        mock_notifier.assert_called_once_with(
            nom_contact=demande.nom_contact,
            email_contact=demande.email,
            nom_boutique_souhaite=demande.nom_boutique_souhaite,
            telephone=demande.telephone,
        )

    @patch('tenants.views.notifier_nouvelle_demande')
    def test_x_forwarded_for_falsifie_ne_contourne_pas_la_limite(self, mock_notifier):
        ip_reelle = '203.0.113.10'
        for index in range(self.LIMITE):
            response = self.client.post(
                '/api/tenants/demande-acces/',
                self._donnees(index),
                HTTP_CF_CONNECTING_IP=ip_reelle,
                HTTP_X_FORWARDED_FOR=f'198.51.100.{index}',
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.post(
            '/api/tenants/demande-acces/',
            self._donnees(self.LIMITE),
            HTTP_CF_CONNECTING_IP=ip_reelle,
            HTTP_X_FORWARDED_FOR='198.51.100.250',
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(DemandeAcces.objects.count(), self.LIMITE)
        self.assertEqual(mock_notifier.call_count, self.LIMITE)

    @patch('tenants.views.notifier_nouvelle_demande')
    def test_ips_reelles_differentes_utilisent_des_quotas_distincts(self, mock_notifier):
        premiere_ip = '203.0.113.11'
        for index in range(self.LIMITE):
            self.client.post(
                '/api/tenants/demande-acces/',
                self._donnees(index),
                HTTP_CF_CONNECTING_IP=premiere_ip,
            )

        refusee = self.client.post(
            '/api/tenants/demande-acces/',
            self._donnees(self.LIMITE),
            HTTP_CF_CONNECTING_IP=premiere_ip,
        )
        acceptee = self.client.post(
            '/api/tenants/demande-acces/',
            self._donnees(self.LIMITE + 1),
            HTTP_CF_CONNECTING_IP='203.0.113.12',
        )

        self.assertEqual(refusee.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(acceptee.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DemandeAcces.objects.count(), self.LIMITE + 1)
        self.assertEqual(mock_notifier.call_count, self.LIMITE + 1)

    @patch('tenants.views.notifier_nouvelle_demande')
    def test_demande_invalide_ne_declenche_pas_d_email(self, mock_notifier):
        donnees = self._donnees()
        donnees['email'] = 'email-invalide'

        response = self.client.post('/api/tenants/demande-acces/', donnees)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DemandeAcces.objects.count(), 0)
        mock_notifier.assert_not_called()

    @patch('tenants.views.notifier_nouvelle_demande')
    def test_throttle_ne_s_applique_pas_aux_autres_routes_publiques(self, mock_notifier):
        for index in range(self.LIMITE):
            self.client.post('/api/tenants/demande-acces/', self._donnees(index))

        self.assertEqual(
            self.client.post('/api/tenants/demande-acces/', self._donnees(self.LIMITE)).status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.assertEqual(self.client.get('/api/health/').status_code, status.HTTP_200_OK)
        self.assertEqual(mock_notifier.call_count, self.LIMITE)


class AbonnementValideTests(TestCase):
    """La validité d'un abonnement dépend de son statut et de sa période."""

    def setUp(self):
        self.aujourdhui = timezone.localdate()
        self.formule = FormuleAbonnement.objects.create(
            nom='Formule validation abonnement', duree_jours=30, prix=5000, actif=True
        )

    def _boutique(self, suffixe):
        return Boutique.objects.create(
            nom=f'Boutique validité {suffixe}', slug=f'boutique-validite-{suffixe}'
        )

    def _abonnement(self, suffixe, statut='ACTIF', date_debut=None, date_fin=None, formule=None):
        boutique = self._boutique(suffixe)
        abonnement = Abonnement.objects.create(
            boutique=boutique,
            formule=formule or self.formule,
            statut=statut,
            date_debut=date_debut or self.aujourdhui,
            date_fin=date_fin or self.aujourdhui + timezone.timedelta(days=30),
        )
        return boutique, abonnement

    def test_abonnement_actif_non_expire_est_valide(self):
        boutique, _ = self._abonnement('actif')

        self.assertTrue(boutique.abonnement_valide())

    def test_abonnement_actif_expire_est_invalide_meme_si_statut_non_mis_a_jour(self):
        boutique, abonnement = self._abonnement(
            'actif-expire', date_fin=self.aujourdhui - timezone.timedelta(days=1)
        )

        self.assertEqual(abonnement.statut, 'ACTIF')
        self.assertFalse(boutique.abonnement_valide())

    def test_abonnement_en_attente_avec_date_future_est_invalide(self):
        boutique, _ = self._abonnement('en-attente', statut='EN_ATTENTE')

        self.assertFalse(boutique.abonnement_valide())

    def test_abonnement_expire_avec_date_future_est_invalide(self):
        boutique, _ = self._abonnement('expire', statut='EXPIRE')

        self.assertFalse(boutique.abonnement_valide())

    def test_abonnement_actif_qui_n_a_pas_commence_est_invalide(self):
        boutique, _ = self._abonnement(
            'a-venir', date_debut=self.aujourdhui + timezone.timedelta(days=1)
        )

        self.assertFalse(boutique.abonnement_valide())

    def test_boutique_sans_abonnement_conserve_l_acces_historique(self):
        boutique = self._boutique('sans-abonnement')

        self.assertTrue(boutique.abonnement_valide())

    def test_essai_gratuit_actif_puis_expire_suit_la_meme_regle(self):
        formule_essai = FormuleAbonnement.objects.create(
            nom='Essai gratuit', duree_jours=14, prix=0, actif=False
        )
        boutique_active, _ = self._abonnement(
            'essai-actif', formule=formule_essai, date_fin=self.aujourdhui + timezone.timedelta(days=14)
        )
        boutique_expire, _ = self._abonnement(
            'essai-expire', formule=formule_essai, date_fin=self.aujourdhui - timezone.timedelta(days=1)
        )

        self.assertTrue(boutique_active.abonnement_valide())
        self.assertFalse(boutique_expire.abonnement_valide())

    def test_paiement_confirme_active_un_abonnement_valide(self):
        boutique = self._boutique('paiement-confirme')
        paiement = PaiementAbonnement.objects.create(
            boutique=boutique, formule=self.formule, montant_attendu=self.formule.prix
        )

        self.assertTrue(confirmer_paiement(paiement.id))
        paiement.refresh_from_db()

        self.assertEqual(paiement.statut, 'CONFIRME')
        self.assertEqual(boutique.abonnement.statut, 'ACTIF')
        self.assertTrue(boutique.abonnement_valide())

    def test_paiement_non_confirme_ne_valide_pas_un_abonnement_en_attente(self):
        boutique, _ = self._abonnement('paiement-en-attente', statut='EN_ATTENTE')
        paiement = PaiementAbonnement.objects.create(
            boutique=boutique, formule=self.formule, montant_attendu=self.formule.prix
        )

        self.assertEqual(paiement.statut, 'EN_ATTENTE')
        self.assertFalse(boutique.abonnement_valide())


class AccesPremiumTests(TestCase):
    """Boutique.a_acces_premium() : le crédit client (V2 étape 7) ne dépend
    pas seulement de la validité de l'abonnement (abonnement_valide(),
    inchangé) mais aussi du palier de la formule active."""

    def setUp(self):
        self.aujourdhui = timezone.localdate()

    def _boutique_avec_formule(self, suffixe, palier, statut='ACTIF'):
        boutique = Boutique.objects.create(
            nom=f'Boutique palier {suffixe}', slug=f'boutique-palier-{suffixe}'
        )
        formule = FormuleAbonnement.objects.create(
            nom=f'Formule {suffixe}', duree_jours=30, prix=5000, actif=True, palier=palier
        )
        Abonnement.objects.create(
            boutique=boutique, formule=formule, statut=statut,
            date_debut=self.aujourdhui, date_fin=self.aujourdhui + timezone.timedelta(days=30),
        )
        return boutique

    def test_essai_gratuit_premium_a_acces_premium(self):
        boutique = self._boutique_avec_formule('essai', palier='PREMIUM')

        self.assertTrue(boutique.a_acces_premium())

    def test_formule_essentiel_na_pas_acces_premium(self):
        boutique = self._boutique_avec_formule('essentiel', palier='ESSENTIEL')

        self.assertFalse(boutique.a_acces_premium())

    def test_sans_abonnement_du_tout_na_pas_acces_premium_sans_planter(self):
        boutique = Boutique.objects.create(nom='Boutique sans abonnement palier', slug='boutique-sans-abonnement-palier')

        self.assertFalse(boutique.a_acces_premium())

    def test_premium_payant_hors_essai_gratuit_a_acces_premium(self):
        boutique = self._boutique_avec_formule('premium-payant', palier='PREMIUM')

        self.assertTrue(boutique.a_acces_premium())

    def test_premium_expire_na_plus_acces_premium(self):
        """a_acces_premium() dépend d'abonnement_valide() : un palier
        Premium expiré ne doit pas rester Premium indéfiniment."""
        boutique = Boutique.objects.create(
            nom='Boutique palier premium expiré', slug='boutique-palier-premium-expire'
        )
        formule = FormuleAbonnement.objects.create(
            nom='Formule premium expirée', duree_jours=30, prix=5000, actif=True, palier='PREMIUM'
        )
        Abonnement.objects.create(
            boutique=boutique, formule=formule, statut='ACTIF',
            date_debut=self.aujourdhui - timezone.timedelta(days=60),
            date_fin=self.aujourdhui - timezone.timedelta(days=1),
        )

        self.assertFalse(boutique.a_acces_premium())

    # --- Exposition côté API (MonAbonnementView), pour l'affichage frontend ---

    def _authentifier(self, boutique):
        user = User.objects.create_user(username=f'user-{boutique.pk}', password='x')
        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=True)
        api_client = APIClient()
        api_client.force_authenticate(user=user)
        return api_client

    def test_mon_abonnement_expose_a_acces_premium_true_pour_le_palier_premium(self):
        boutique = self._boutique_avec_formule('api-premium', palier='PREMIUM')

        response = self._authentifier(boutique).get('/api/tenants/mon-abonnement/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['a_acces_premium'])

    def test_mon_abonnement_expose_a_acces_premium_false_pour_le_palier_essentiel(self):
        boutique = self._boutique_avec_formule('api-essentiel', palier='ESSENTIEL')

        response = self._authentifier(boutique).get('/api/tenants/mon-abonnement/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['a_acces_premium'])

    def test_mon_abonnement_expose_a_acces_premium_false_sans_abonnement_du_tout(self):
        boutique = Boutique.objects.create(nom='Boutique API sans abonnement', slug='boutique-api-sans-abonnement')

        response = self._authentifier(boutique).get('/api/tenants/mon-abonnement/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['a_acces_premium'])


class EssaiGratuitApprouverDemandeTests(TestCase):
    """Point 8 de l'audit : une boutique créée via le flux client normal
    (DemandeAcces -> ApprouverDemandeView) doit démarrer avec un essai
    gratuit de 14 jours, pas un accès illimité."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_plateforme', email='admin@example.com', password='x'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.demande = DemandeAcces.objects.create(
            nom_contact='Awa Diop',
            email='awa@example.com',
            nom_boutique_souhaite='Boutique Awa',
        )

    def test_approbation_cree_un_abonnement_essai_14_jours(self):
        aujourdhui = timezone.localdate()
        response = self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')

        self.assertEqual(response.status_code, 201)

        boutique = Boutique.objects.get(nom='Boutique Awa')
        abonnement = Abonnement.objects.get(boutique=boutique)

        self.assertEqual(abonnement.formule.nom, 'Essai gratuit')
        self.assertEqual(abonnement.statut, 'ACTIF')
        self.assertEqual(abonnement.date_debut, aujourdhui)
        self.assertEqual(abonnement.date_fin, aujourdhui + timezone.timedelta(days=14))
        self.assertEqual(abonnement.reference_paiement, 'ESSAI_GRATUIT')

    def test_boutique_accessible_pendant_essai(self):
        self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')
        boutique = Boutique.objects.get(nom='Boutique Awa')

        self.assertTrue(boutique.abonnement_valide())
        self.assertTrue(boutique.est_accessible())

    def test_boutique_bloquee_apres_expiration_essai(self):
        self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')
        boutique = Boutique.objects.get(nom='Boutique Awa')

        abonnement = boutique.abonnement
        abonnement.date_fin = timezone.localdate() - timezone.timedelta(days=1)
        abonnement.save()

        self.assertFalse(boutique.abonnement_valide())
        self.assertFalse(boutique.est_accessible())

    def test_formule_essai_non_listee_publiquement(self):
        """La formule interne d'essai ne doit jamais apparaître dans le
        catalogue de formules proposées au client (elle n'est pas
        sélectionnable manuellement)."""
        self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')

        formule_essai = FormuleAbonnement.objects.get(nom='Essai gratuit')
        self.assertFalse(formule_essai.actif)


class ApprouverDemandeTransactionTests(TestCase):
    """Audit IwiShop point 9 : Boutique -> UniteVente -> Abonnement -> User
    -> Profil doit être transactionnel - un échec à mi-chemin ne doit
    laisser aucune donnée partielle (Boutique orpheline sans propriétaire)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_plateforme_tx', email='admin_tx@example.com', password='x'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.demande = DemandeAcces.objects.create(
            nom_contact='Awa Diop',
            email='awa_tx@example.com',
            nom_boutique_souhaite='Boutique Awa Tx',
        )

    def test_echec_a_mi_chemin_ne_laisse_aucune_donnee_partielle(self):
        """Reproduit exactement le scénario constaté en pratique : la
        formule interne 'Essai gratuit' (normalement garantie par la
        migration 0006_seed_formule_essai) est absente au moment de
        l'appel - Boutique et UniteVente, déjà créées avant ce point,
        doivent être annulées avec le reste plutôt que laissées orphelines.

        Comparaison en delta (avant/après), pas en compte absolu : les
        migrations de données (0002_backfill_boutique_par_defaut,
        0007_backfill_unites_prix) sèment déjà une Boutique "Ma Boutique"
        et ses UniteVente par défaut, indépendamment de ce flux."""
        nb_boutiques_avant = Boutique.objects.count()
        nb_unites_avant = UniteVente.objects.count()
        nb_abonnements_avant = Abonnement.objects.count()
        nb_users_avant = User.objects.count()

        FormuleAbonnement.objects.filter(nom='Essai gratuit').delete()

        with self.assertRaises(FormuleAbonnement.DoesNotExist):
            self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')

        self.assertEqual(Boutique.objects.count(), nb_boutiques_avant)
        self.assertFalse(Boutique.objects.filter(nom='Boutique Awa Tx').exists())
        self.assertEqual(UniteVente.objects.count(), nb_unites_avant)
        self.assertEqual(Abonnement.objects.count(), nb_abonnements_avant)
        # Aucun compte propriétaire orphelin.
        self.assertEqual(User.objects.count(), nb_users_avant)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, 'EN_ATTENTE')

    def test_creation_normale_toujours_fonctionnelle(self):
        """Non-régression : la transaction ne casse pas le chemin nominal."""
        response = self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Boutique.objects.filter(nom='Boutique Awa Tx').count(), 1)
        boutique = Boutique.objects.get(nom='Boutique Awa Tx')
        self.assertEqual(UniteVente.objects.filter(boutique=boutique).count(), 2)
        self.assertTrue(Abonnement.objects.filter(boutique=boutique).exists())
        self.assertTrue(Profil.objects.filter(boutique=boutique, est_proprietaire=True).exists())
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, 'APPROUVEE')


class ExemptionCreationAdminTests(TestCase):
    """Garde-fou de non-régression : une boutique créée directement (comme
    depuis l'admin Django, hors DemandeAcces) ne doit PAS recevoir d'essai
    automatique - elle reste sur le fallback historique
    (pas d'abonnement = accès autorisé), comme convenu."""

    def test_boutique_creee_directement_reste_exemptee(self):
        boutique = Boutique.objects.create(nom='Boutique Test Admin', slug='boutique-test-admin')

        self.assertFalse(hasattr(boutique, 'abonnement'))
        self.assertTrue(boutique.abonnement_valide())
        self.assertTrue(boutique.est_accessible())


class WebhookEchecVerificationTests(TestCase):
    """Point 9 de l'audit : un échec de la vérification serveur-à-serveur
    (réseau, JSON invalide, réponse non conforme) ne doit JAMAIS être
    traité comme un paiement non complété - sinon un paiement réellement
    'completed' pourrait ne jamais être crédité si PayDunya ne renvoie
    pas l'IPN une seconde fois."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Paydunya', slug='boutique-paydunya')
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel', duree_jours=30, prix=5000, actif=True
        )
        self.paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, invoice_token='tok-123',
            montant_attendu=self.formule.prix,
        )
        self.client = APIClient()

    def _post_webhook(self, paiement_id, token='tok-123'):
        return self.client.post('/api/tenants/paydunya-webhook/', {
            'data[hash]': hash_paydunya_valide(),
            'data[invoice][token]': token,
            'data[custom_data][paiement_id]': str(paiement_id),
        })

    @patch('tenants.views.paydunya.confirmer_facture')
    def test_echec_verification_ne_credite_pas_et_nest_pas_acquitte_200(self, mock_confirmer):
        mock_confirmer.side_effect = paydunya.PaydunyaVerificationError('panne simulée')

        with self.assertLogs('tenants.views', level='ERROR') as logs:
            response = self._post_webhook(self.paiement.id)

        self.assertNotEqual(response.status_code, 200)
        self.assertTrue(any('vérification impossible' in message for message in logs.output))

        self.paiement.refresh_from_db()
        self.assertEqual(self.paiement.statut, 'EN_ATTENTE')
        self.assertFalse(hasattr(self.boutique, 'abonnement'))

    def test_confirmer_facture_leve_verification_error_sur_json_malforme(self):
        with patch('tenants.paydunya.requests.get') as mock_get:
            reponse_factice = Mock()
            reponse_factice.json.side_effect = ValueError('invalid json')
            mock_get.return_value = reponse_factice

            with self.assertRaises(paydunya.PaydunyaVerificationError):
                paydunya.confirmer_facture('tok-123')

    def test_webhook_avec_json_malformee_ne_plante_pas_en_500(self):
        with patch('tenants.paydunya.requests.get') as mock_get:
            reponse_factice = Mock()
            reponse_factice.json.side_effect = ValueError('invalid json')
            mock_get.return_value = reponse_factice

            response = self._post_webhook(self.paiement.id)

        self.assertNotEqual(response.status_code, 500)
        self.assertEqual(response.status_code, 502)

    def test_creer_facture_avec_json_malformee_ne_plante_pas_en_500(self):
        boutique = Boutique.objects.create(nom='Boutique Creation', slug='boutique-creation')
        owner = User.objects.create_user(username='owner_creation', password='x')
        Profil.objects.create(user=owner, boutique=boutique, est_proprietaire=True)

        client = APIClient()
        client.force_authenticate(user=owner)

        with patch('tenants.paydunya.requests.post') as mock_post:
            reponse_factice = Mock()
            reponse_factice.json.side_effect = ValueError('invalid json')
            mock_post.return_value = reponse_factice

            response = client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertNotEqual(response.status_code, 500)
        self.assertEqual(response.status_code, 502)


class CreerPaiementDedoublonnageTests(TestCase):
    """Point 9 de l'audit : deux appels rapprochés à creer-paiement/ pour la
    même boutique/formule (double-clic, rechargement, deux onglets) ne
    doivent pas créer deux factures PayDunya distinctes."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Dedup', slug='boutique-dedup')
        self.owner = User.objects.create_user(username='owner_dedup', password='x')
        Profil.objects.create(user=self.owner, boutique=self.boutique, est_proprietaire=True)
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel', duree_jours=30, prix=5000, actif=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    @patch('tenants.views.paydunya.creer_facture')
    def test_double_appel_rapide_reutilise_le_paiement_existant(self, mock_creer):
        mock_creer.return_value = (True, {'token': 'tok-abc', 'url': 'https://paydunya.test/checkout/abc'})

        reponse_1 = self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})
        reponse_2 = self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertEqual(reponse_1.status_code, 200)
        self.assertEqual(reponse_2.status_code, 200)
        self.assertEqual(reponse_1.data['url_paiement'], reponse_2.data['url_paiement'])
        self.assertEqual(reponse_1.data['paiement_id'], reponse_2.data['paiement_id'])
        mock_creer.assert_called_once()
        self.assertEqual(
            PaiementAbonnement.objects.filter(boutique=self.boutique, formule=self.formule).count(), 1
        )

    @patch('tenants.views.paydunya.creer_facture')
    def test_paiement_hors_fenetre_recree_un_nouveau(self, mock_creer):
        mock_creer.return_value = (True, {'token': 'tok-abc', 'url': 'https://paydunya.test/checkout/abc'})
        self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        ancien = PaiementAbonnement.objects.get(boutique=self.boutique, formule=self.formule)
        ancien.date_creation = timezone.now() - timezone.timedelta(minutes=20)
        ancien.save(update_fields=['date_creation'])

        mock_creer.return_value = (True, {'token': 'tok-def', 'url': 'https://paydunya.test/checkout/def'})
        self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertEqual(mock_creer.call_count, 2)
        self.assertEqual(
            PaiementAbonnement.objects.filter(boutique=self.boutique, formule=self.formule).count(), 2
        )

    @patch('tenants.views.paydunya.creer_facture')
    def test_paiement_confirme_ne_bloque_pas_un_nouvel_achat(self, mock_creer):
        mock_creer.return_value = (True, {'token': 'tok-abc', 'url': 'https://paydunya.test/checkout/abc'})
        self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        PaiementAbonnement.objects.filter(boutique=self.boutique, formule=self.formule).update(statut='CONFIRME')

        mock_creer.return_value = (True, {'token': 'tok-def', 'url': 'https://paydunya.test/checkout/def'})
        self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertEqual(mock_creer.call_count, 2)

    @patch('tenants.views.paydunya.creer_facture')
    def test_echec_paydunya_ne_bloque_pas_un_nouveau_paiement(self, mock_creer):
        mock_creer.return_value = (False, 'erreur temporaire')

        echec = self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertEqual(echec.status_code, 502)
        self.assertEqual(
            PaiementAbonnement.objects.get(boutique=self.boutique, formule=self.formule).statut,
            'ECHEC',
        )

        mock_creer.return_value = (True, {'token': 'tok-apres-echec', 'url': 'https://paydunya.test/checkout/apres-echec'})
        succes = self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertEqual(succes.status_code, 200)
        self.assertEqual(
            PaiementAbonnement.objects.filter(boutique=self.boutique, formule=self.formule).count(), 2
        )

    @patch('tenants.views.paydunya.creer_facture')
    def test_boutiques_differentes_creent_leurs_paiements_independamment(self, mock_creer):
        mock_creer.side_effect = [
            (True, {'token': 'tok-a', 'url': 'https://paydunya.test/checkout/a'}),
            (True, {'token': 'tok-b', 'url': 'https://paydunya.test/checkout/b'}),
        ]
        autre_boutique = Boutique.objects.create(nom='Boutique Dedup B', slug='boutique-dedup-b')
        autre_user = User.objects.create_user(username='owner_dedup_b', password='x')
        Profil.objects.create(user=autre_user, boutique=autre_boutique, est_proprietaire=True)
        autre_client = APIClient()
        autre_client.force_authenticate(user=autre_user)

        premier = self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})
        second = autre_client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        self.assertEqual(premier.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(PaiementAbonnement.objects.filter(formule=self.formule, statut='EN_ATTENTE').count(), 2)


@skipUnless(connection.vendor == 'postgresql', 'Le verrou de ligne est testé sur PostgreSQL uniquement.')
class CreerPaiementConcurrentTests(TransactionTestCase):
    """Reproduit deux requêtes réellement concurrentes avec deux connexions
    PostgreSQL. SQLite ne représente pas les verrous de production."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Concurrente', slug='boutique-concurrente')
        self.owner = User.objects.create_user(username='owner_concurrent', password='x')
        Profil.objects.create(user=self.owner, boutique=self.boutique, est_proprietaire=True)
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel concurrent', duree_jours=30, prix=5000, actif=True
        )

    def test_deux_requetes_concurrentes_ne_creent_qu_une_invoice(self):
        barriere = threading.Barrier(2)
        facture_demarre = threading.Event()
        liberer_facture = threading.Event()
        resultats = []
        erreurs = []
        verrou_resultats = threading.Lock()

        def creer_facture_lentement(paiement):
            facture_demarre.set()
            liberer_facture.wait(timeout=10)
            return True, {
                'token': f'tok-concurrent-{paiement.id}',
                'url': f'https://paydunya.test/checkout/{paiement.id}',
            }

        def requete_concurrente():
            connections.close_all()
            client = APIClient()
            client.force_authenticate(user=self.owner)
            try:
                barriere.wait(timeout=10)
                response = client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})
                with verrou_resultats:
                    resultats.append(response.status_code)
            except Exception as erreur:
                with verrou_resultats:
                    erreurs.append(erreur)
            finally:
                connections.close_all()

        with patch('tenants.views.paydunya.creer_facture', side_effect=creer_facture_lentement) as mock_creer:
            threads = [threading.Thread(target=requete_concurrente) for _ in range(2)]
            for thread in threads:
                thread.start()

            self.assertTrue(facture_demarre.wait(timeout=10), repr(erreurs))
            limite_attente = time.monotonic() + 10
            while not resultats and time.monotonic() < limite_attente:
                time.sleep(0.01)
            self.assertEqual(resultats, [status.HTTP_409_CONFLICT])
            liberer_facture.set()
            for thread in threads:
                thread.join(timeout=15)

        self.assertFalse(erreurs)
        self.assertEqual(sorted(resultats), [status.HTTP_200_OK, status.HTTP_409_CONFLICT])
        self.assertEqual(mock_creer.call_count, 1)
        self.assertEqual(
            PaiementAbonnement.objects.filter(
                boutique=self.boutique,
                formule=self.formule,
                statut='EN_ATTENTE',
            ).count(),
            1,
        )


class PaiementAbonnementStatutViewTests(TestCase):
    """Le retour frontend consulte le paiement précis, jamais l'état global
    de l'abonnement de la boutique."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Paiement', slug='boutique-paiement')
        self.owner = User.objects.create_user(username='owner_paiement', password='x')
        Profil.objects.create(user=self.owner, boutique=self.boutique, est_proprietaire=True)
        self.autre_boutique = Boutique.objects.create(nom='Autre Boutique', slug='autre-boutique')
        self.autre_owner = User.objects.create_user(username='autre_owner_paiement', password='x')
        Profil.objects.create(user=self.autre_owner, boutique=self.autre_boutique, est_proprietaire=True)
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel statut', duree_jours=30, prix=5000, actif=True
        )
        self.paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, montant_attendu=self.formule.prix,
        )
        self.client = APIClient()

    def _url(self, paiement_id=None):
        return f'/api/tenants/paiements-abonnement/{paiement_id or self.paiement.id}/'

    def test_proprietaire_consulte_son_paiement_en_attente_malgre_abonnement_valide(self):
        # Régression critique : l'abonnement courant ne confirme pas un
        # nouveau renouvellement encore EN_ATTENTE.
        Abonnement.objects.create(
            boutique=self.boutique,
            formule=self.formule,
            date_debut=timezone.localdate(),
            date_fin=timezone.localdate() + timezone.timedelta(days=10),
            statut='ACTIF',
        )
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(self._url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'id': self.paiement.id, 'statut': 'EN_ATTENTE'})

    def test_paiement_confirme_est_retourne_comme_confirme(self):
        self.paiement.statut = 'CONFIRME'
        self.paiement.save(update_fields=['statut'])
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(self._url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['statut'], 'CONFIRME')

    def test_autre_boutique_ne_peut_pas_consulter_le_paiement(self):
        self.client.force_authenticate(user=self.autre_owner)

        response = self.client.get(self._url())

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data, {'detail': 'Paiement introuvable.'})

    def test_identifiant_inexistant_retourne_la_meme_reponse_sans_fuite(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(self._url(999999))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data, {'detail': 'Paiement introuvable.'})

    def test_identifiant_invalide_retourne_une_reponse_propre(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.get('/api/tenants/paiements-abonnement/invalide/')

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data, {'detail': 'Paiement introuvable.'})

    @patch('tenants.paydunya.config')
    @patch('tenants.paydunya.requests.post')
    def test_facture_paydunya_retourne_avec_l_identifiant_du_paiement(self, mock_post, mock_config):
        def valeur_config(nom, default=None):
            return {
                'FRONTEND_URL': 'https://frontend.test',
                'BACKEND_URL': 'https://backend.test',
            }.get(nom, default or 'cle-test')

        mock_config.side_effect = valeur_config
        mock_post.return_value.json.return_value = {
            'response_code': '00',
            'token': 'token-test',
            'response_text': 'https://paydunya.test/checkout',
        }

        ok, _ = paydunya.creer_facture(self.paiement)

        self.assertTrue(ok)
        actions = mock_post.call_args.kwargs['json']['actions']
        url_attendue = f'https://frontend.test/abonnement/retour?paiement_id={self.paiement.id}'
        self.assertEqual(actions['return_url'], url_attendue)
        self.assertEqual(actions['cancel_url'], url_attendue)


class WebhookNonRegressionTests(TestCase):
    """Point 9 de l'audit : garde-fous sur ce qui était déjà validé avant
    cet audit (hash, référence inconnue, idempotence, activation dans les
    3 branches) - pour qu'une régression future soit détectée automatiquement."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Regression', slug='boutique-regression')
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel', duree_jours=30, prix=5000, actif=True
        )
        self.client = APIClient()

    def _post_webhook(self, paiement_id, token='tok-999', hash_recu=None):
        return self.client.post('/api/tenants/paydunya-webhook/', {
            'data[hash]': hash_recu if hash_recu is not None else hash_paydunya_valide(),
            'data[invoice][token]': token,
            'data[custom_data][paiement_id]': str(paiement_id),
        })

    def test_hash_invalide_rejette_sans_appeler_paydunya(self):
        with patch('tenants.views.paydunya.confirmer_facture') as mock_confirmer:
            response = self._post_webhook(paiement_id=1, hash_recu='hash-invalide')

        self.assertEqual(response.status_code, 400)
        mock_confirmer.assert_not_called()

    def test_reference_inconnue_repond_404_pas_500(self):
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': 5000},
        ):
            response = self._post_webhook(paiement_id=999999)

        self.assertEqual(response.status_code, 404)

    def test_webhook_duplique_ne_double_pas_le_credit(self):
        paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, invoice_token='tok-999',
            montant_attendu=self.formule.prix,
        )
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': 5000},
        ):
            self._post_webhook(paiement.id)
            self._post_webhook(paiement.id)

        abonnement = Abonnement.objects.get(boutique=self.boutique)
        self.assertEqual(abonnement.date_fin, timezone.localdate() + timezone.timedelta(days=30))

    def test_confirmer_paiement_idempotent_appel_direct(self):
        paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, invoice_token='tok-777',
            montant_attendu=self.formule.prix,
        )
        self.assertTrue(confirmer_paiement(paiement.id))
        self.assertFalse(confirmer_paiement(paiement.id))

        abonnement = Abonnement.objects.get(boutique=self.boutique)
        self.assertEqual(abonnement.date_fin, timezone.localdate() + timezone.timedelta(days=30))

    def test_activation_premier_paiement(self):
        paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, montant_attendu=self.formule.prix,
        )
        confirmer_paiement(paiement.id)

        abonnement = Abonnement.objects.get(boutique=self.boutique)
        self.assertEqual(abonnement.date_debut, timezone.localdate())
        self.assertEqual(abonnement.date_fin, timezone.localdate() + timezone.timedelta(days=30))

    def test_activation_paiement_en_avance_empile_sur_date_fin_existante(self):
        Abonnement.objects.create(
            boutique=self.boutique, formule=self.formule,
            date_debut=timezone.localdate(),
            date_fin=timezone.localdate() + timezone.timedelta(days=10),
            statut='ACTIF',
        )
        paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, montant_attendu=self.formule.prix,
        )
        confirmer_paiement(paiement.id)

        abonnement = Abonnement.objects.get(boutique=self.boutique)
        self.assertEqual(abonnement.date_fin, timezone.localdate() + timezone.timedelta(days=40))

    def test_activation_paiement_apres_expiration_redemarre_a_aujourdhui(self):
        Abonnement.objects.create(
            boutique=self.boutique, formule=self.formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='ACTIF',
        )
        paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, montant_attendu=self.formule.prix,
        )
        confirmer_paiement(paiement.id)

        abonnement = Abonnement.objects.get(boutique=self.boutique)
        self.assertEqual(abonnement.date_debut, timezone.localdate())
        self.assertEqual(abonnement.date_fin, timezone.localdate() + timezone.timedelta(days=30))


class WebhookMontantConfirmeTests(TestCase):
    """Audit point 7 : le webhook ne comparait que le statut PayDunya
    ('completed'), jamais le montant réellement confirmé au montant
    attendu (celui de la FormuleAbonnement choisie, figé à la création de
    la facture sur PaiementAbonnement.montant_attendu). Un montant payé
    inférieur au prix de la formule créditait quand même l'abonnement
    complet - contournement démontré."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Montant', slug='boutique-montant')
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel', duree_jours=30, prix=5000, actif=True
        )
        self.paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=self.formule, invoice_token='tok-montant',
            montant_attendu=self.formule.prix,
        )
        self.client = APIClient()

    def _post_webhook(self, paiement_id, token='tok-montant'):
        return self.client.post('/api/tenants/paydunya-webhook/', {
            'data[hash]': hash_paydunya_valide(),
            'data[invoice][token]': token,
            'data[custom_data][paiement_id]': str(paiement_id),
        })

    def test_montant_confirme_inferieur_refuse_credit(self):
        """Reproduit exactement le contournement décrit : payer moins que
        le prix de la formule (1000 au lieu de 5000) ne doit plus créditer
        l'abonnement."""
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': 1000},
        ):
            with self.assertLogs('tenants.views', level='ERROR') as logs:
                response = self._post_webhook(self.paiement.id)

        self.assertEqual(response.status_code, 400)
        self.assertTrue(any('montant confirmé' in message for message in logs.output))
        self.paiement.refresh_from_db()
        self.assertEqual(self.paiement.statut, 'EN_ATTENTE')
        self.assertFalse(hasattr(self.boutique, 'abonnement'))

    def test_montant_confirme_superieur_refuse_credit(self):
        """La comparaison est une égalité stricte, pas un simple seuil
        minimum : un montant confirmé différent (même supérieur) est aussi
        rejeté plutôt que silencieusement accepté."""
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': 9000},
        ):
            response = self._post_webhook(self.paiement.id)

        self.assertEqual(response.status_code, 400)
        self.paiement.refresh_from_db()
        self.assertEqual(self.paiement.statut, 'EN_ATTENTE')

    def test_montant_confirme_absent_refuse_credit(self):
        """Si PayDunya ne renvoie pas le montant confirmé (réponse
        inattendue), on ne peut pas vérifier - on ne crédite pas plutôt
        que de faire confiance au statut seul."""
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': None},
        ):
            response = self._post_webhook(self.paiement.id)

        self.assertEqual(response.status_code, 400)
        self.paiement.refresh_from_db()
        self.assertEqual(self.paiement.statut, 'EN_ATTENTE')

    def test_montant_confirme_egal_credite_normalement(self):
        """Non-régression : un montant confirmé égal au montant attendu
        crédite l'abonnement normalement."""
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': 5000},
        ):
            response = self._post_webhook(self.paiement.id)

        self.assertEqual(response.status_code, 200)
        self.paiement.refresh_from_db()
        self.assertEqual(self.paiement.statut, 'CONFIRME')
        abonnement = Abonnement.objects.get(boutique=self.boutique)
        self.assertEqual(abonnement.date_fin, timezone.localdate() + timezone.timedelta(days=30))

    def test_montant_confirme_decimal_exact_credite_normalement(self):
        """Non-régression : un montant décimal (ex: renvoyé en chaîne par
        l'API) doit être comparé correctement, pas seulement les entiers."""
        formule_decimale = FormuleAbonnement.objects.create(
            nom='Annuel', duree_jours=365, prix=Decimal('4999.99'), actif=True
        )
        paiement = PaiementAbonnement.objects.create(
            boutique=self.boutique, formule=formule_decimale, invoice_token='tok-decimal',
            montant_attendu=formule_decimale.prix,
        )
        with patch(
            'tenants.views.paydunya.confirmer_facture',
            return_value={'status': 'completed', 'montant_confirme': '4999.99'},
        ):
            response = self._post_webhook(paiement.id, token='tok-decimal')

        self.assertEqual(response.status_code, 200)
        paiement.refresh_from_db()
        self.assertEqual(paiement.statut, 'CONFIRME')


class CreerPaiementMontantAttenduTests(TestCase):
    """Audit point 7 (subsidiaire) : le montant attendu doit être figé au
    prix de la formule au moment de la création de la facture, pas relu
    depuis FormuleAbonnement.prix à la confirmation - qui pourrait avoir
    changé entre-temps."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom='Boutique Fige', slug='boutique-fige')
        self.owner = User.objects.create_user(username='owner_fige', password='x')
        Profil.objects.create(user=self.owner, boutique=self.boutique, est_proprietaire=True)
        self.formule = FormuleAbonnement.objects.create(
            nom='Mensuel', duree_jours=30, prix=5000, actif=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    @patch('tenants.views.paydunya.creer_facture')
    def test_montant_attendu_fige_au_prix_de_la_formule(self, mock_creer):
        mock_creer.return_value = (True, {'token': 'tok-fige', 'url': 'https://paydunya.test/checkout/fige'})

        self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})

        paiement = PaiementAbonnement.objects.get(boutique=self.boutique, formule=self.formule)
        self.assertEqual(paiement.montant_attendu, Decimal('5000.00'))

    @patch('tenants.views.paydunya.creer_facture')
    def test_changement_de_prix_de_la_formule_apres_creation_naffecte_pas_le_montant_attendu(self, mock_creer):
        mock_creer.return_value = (True, {'token': 'tok-fige2', 'url': 'https://paydunya.test/checkout/fige2'})

        self.client.post('/api/tenants/creer-paiement/', {'formule_id': self.formule.id})
        paiement = PaiementAbonnement.objects.get(boutique=self.boutique, formule=self.formule)

        self.formule.prix = Decimal('9999.00')
        self.formule.save()

        paiement.refresh_from_db()
        self.assertEqual(paiement.montant_attendu, Decimal('5000.00'))


class ProfilManquantTests(TestCase):
    """Audit point 11 : un compte authentifié sans Profil (le
    superuser/administrateur de la plateforme, qui n'est jamais rattaché
    à une boutique) faisait planter en 500 chacun des 11 accès directs à
    request.user.profil dispersés dans les ViewSets et serializers, dès
    qu'il touchait un endpoint normal (scopé boutique) sans passer par la
    Vue Support. Centralisé dans tenants.profil.boutique_de() qui lève
    une 403 propre à la place."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_sans_profil', email='admin_sp@example.com', password='x'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_liste_produits_sans_profil_403_pas_500(self):
        """Chemin ViewSet (BoutiqueScopedMixin.get_queryset -> _boutique_effective)."""
        response = self.client.get('/api/produits/')
        self.assertEqual(response.status_code, 403)

    def test_creation_produit_sans_profil_403_pas_500(self):
        """Chemin serializer (ProduitSerializer.boutique = HiddenField(CurrentBoutiqueDefault()),
        exécuté pendant is_valid(), avant même perform_create()."""
        response = self.client.post('/api/produits/', {
            "nom": "Produit test", "prix_achat": "100.00",
            "prix_unitaire": "150.00", "prix_douzaine": "1500.00",
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_creation_categorie_sans_profil_403_pas_500(self):
        response = self.client.post('/api/categories/', {"nom": "Test"}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_mon_abonnement_sans_profil_403_pas_500(self):
        response = self.client.get('/api/tenants/mon-abonnement/')
        self.assertEqual(response.status_code, 403)

    def test_mes_acces_support_sans_profil_403_pas_500(self):
        response = self.client.get('/api/tenants/mes-acces-support/')
        self.assertEqual(response.status_code, 403)

    def test_creer_paiement_sans_profil_403_pas_500(self):
        formule = FormuleAbonnement.objects.create(nom='Mensuel', duree_jours=30, prix=5000, actif=True)
        response = self.client.post('/api/tenants/creer-paiement/', {'formule_id': formule.id})
        self.assertEqual(response.status_code, 403)

    def test_vue_support_reste_fonctionnelle_pour_le_meme_superuser(self):
        """Non-régression : ce même superuser sans Profil doit toujours
        pouvoir consulter une boutique via la Vue Support (en-tête
        explicite) - seul le fallback request.user.profil est concerné."""
        boutique = Boutique.objects.create(nom='Boutique Vue Support', slug='boutique-vue-support-profil')

        response = self.client.get('/api/produits/', HTTP_X_SUPPORT_BOUTIQUE=str(boutique.id))

        self.assertEqual(response.status_code, 200)

    def test_utilisateur_avec_profil_non_affecte(self):
        """Non-régression : un utilisateur normal (avec Profil) continue
        d'accéder à ses propres endpoints sans changement de comportement."""
        boutique = Boutique.objects.create(nom='Boutique Normale', slug='boutique-normale-profil')
        user = User.objects.create_user(username='user_normal_profil', password='pass1234')
        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=True)

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/produits/')

        self.assertEqual(response.status_code, 200)


class MesBoutiquesTests(TestCase):
    """Multi-boutique, étape 2 : GET /api/tenants/mes-boutiques/ alimente
    le sélecteur de boutique - une entrée par Profil de l'utilisateur
    connecté, jamais celles d'un autre compte."""

    def setUp(self):
        self.client = APIClient()

    def test_une_seule_boutique_renvoie_un_seul_element(self):
        boutique = Boutique.objects.create(nom='Boutique Unique', slug='mb-boutique-unique')
        user = User.objects.create_user(username='mb-user-unique', password='pass1234')
        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=True)
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/tenants/mes-boutiques/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resultats = response.data.get('results', response.data)
        self.assertEqual(len(resultats), 1)
        self.assertEqual(resultats[0], {
            'id': boutique.id, 'nom': 'Boutique Unique', 'est_proprietaire': True,
        })

    def test_deux_boutiques_renvoie_deux_elements_avec_le_bon_est_proprietaire(self):
        boutique_a = Boutique.objects.create(nom='Boutique A', slug='mb-boutique-a')
        boutique_b = Boutique.objects.create(nom='Boutique B', slug='mb-boutique-b')
        user = User.objects.create_user(username='mb-user-multi', password='pass1234')
        Profil.objects.create(user=user, boutique=boutique_a, est_proprietaire=True)
        Profil.objects.create(user=user, boutique=boutique_b, est_proprietaire=False)
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/tenants/mes-boutiques/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resultats = response.data.get('results', response.data)
        self.assertEqual(len(resultats), 2)
        par_id = {r['id']: r for r in resultats}
        self.assertTrue(par_id[boutique_a.id]['est_proprietaire'])
        self.assertFalse(par_id[boutique_b.id]['est_proprietaire'])

    def test_ne_voit_jamais_les_boutiques_dun_autre_compte(self):
        """Sécurité : même avec plusieurs comptes et boutiques en base en
        même temps, chacun ne voit que les siennes."""
        boutique_moi = Boutique.objects.create(nom='Boutique Moi', slug='mb-boutique-moi')
        boutique_autre = Boutique.objects.create(nom='Boutique Autre', slug='mb-boutique-autre')
        moi = User.objects.create_user(username='mb-moi', password='pass1234')
        autre = User.objects.create_user(username='mb-autre', password='pass1234')
        Profil.objects.create(user=moi, boutique=boutique_moi, est_proprietaire=True)
        Profil.objects.create(user=autre, boutique=boutique_autre, est_proprietaire=True)
        self.client.force_authenticate(user=moi)

        response = self.client.get('/api/tenants/mes-boutiques/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resultats = response.data.get('results', response.data)
        ids = {r['id'] for r in resultats}
        self.assertEqual(ids, {boutique_moi.id})

    def test_sans_authentification_401(self):
        response = self.client.get('/api/tenants/mes-boutiques/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
