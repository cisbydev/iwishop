import hashlib
from decimal import Decimal
from unittest.mock import Mock, patch

from decouple import config
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
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
