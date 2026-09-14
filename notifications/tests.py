from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase, APIClient

from tenants.models import Boutique, Profil
from .models import DestinataireNotification, Notification, TypeNotification


class NotificationConsultationTests(APITestCase):
    """V2 étape 10 : structure de données + consultation des notifications
    (la création réelle - stock bas / dette en retard - n'est pas câblée
    à cette étape)."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique Notif A", slug="boutique-notif-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique Notif B", slug="boutique-notif-b")

        self.proprietaire = User.objects.create_user(username="notif_proprietaire", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique_a, est_proprietaire=True)

        self.employe = User.objects.create_user(username="notif_employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique_a, est_proprietaire=False)

        self.user_b = User.objects.create_user(username="notif_user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.notif_tous_a = Notification.objects.create(
            boutique=self.boutique_a, type_notification=TypeNotification.STOCK_BAS,
            message="Stock bas sur Produit X", destinataire_role=DestinataireNotification.TOUS,
        )
        self.notif_proprietaire_a = Notification.objects.create(
            boutique=self.boutique_a, type_notification=TypeNotification.DETTE_RETARD,
            message="Dette en retard sur Vente V-1234", destinataire_role=DestinataireNotification.PROPRIETAIRE,
        )
        self.notif_b = Notification.objects.create(
            boutique=self.boutique_b, type_notification=TypeNotification.STOCK_BAS,
            message="Stock bas sur Produit Y", destinataire_role=DestinataireNotification.TOUS,
        )

        self.url_list = reverse('notifications-list')
        self.url_non_lues_count = reverse('notifications-non-lues-count')

    def _client(self, user):
        api_client = APIClient()
        api_client.force_authenticate(user=user)
        return api_client

    # --- Isolation multi-tenant ---

    def test_notification_dune_autre_boutique_najamais_visible(self):
        response = self._client(self.proprietaire).get(self.url_list)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {n['id'] for n in response.data.get('results', response.data)}
        self.assertNotIn(self.notif_b.id, ids)
        self.assertIn(self.notif_tous_a.id, ids)
        self.assertIn(self.notif_proprietaire_a.id, ids)

    # --- Filtrage par rôle ---

    def test_employe_ne_voit_jamais_une_notification_proprietaire(self):
        response = self._client(self.employe).get(self.url_list)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {n['id'] for n in response.data.get('results', response.data)}
        self.assertIn(self.notif_tous_a.id, ids)
        self.assertNotIn(self.notif_proprietaire_a.id, ids)

    def test_proprietaire_voit_toutes_les_notifications_de_sa_boutique(self):
        response = self._client(self.proprietaire).get(self.url_list)

        ids = {n['id'] for n in response.data.get('results', response.data)}
        self.assertEqual(ids, {self.notif_tous_a.id, self.notif_proprietaire_a.id})

    def test_non_lues_count_exclut_les_notifications_hors_role(self):
        response = self._client(self.employe).get(self.url_non_lues_count)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)

    # --- marquer_lue ---

    def test_marquer_lue_fonctionne_et_est_idempotent(self):
        url = reverse('notifications-marquer-lue', args=[self.notif_tous_a.id])
        api_client = self._client(self.proprietaire)

        response_1 = api_client.post(url)
        self.assertEqual(response_1.status_code, status.HTTP_200_OK)
        self.assertTrue(response_1.data['lue'])
        self.notif_tous_a.refresh_from_db()
        self.assertTrue(self.notif_tous_a.lue)

        # Deuxième appel : ne casse rien, reste lue.
        response_2 = api_client.post(url)
        self.assertEqual(response_2.status_code, status.HTTP_200_OK)
        self.assertTrue(response_2.data['lue'])

    def test_employe_ne_peut_pas_marquer_lue_une_notification_proprietaire(self):
        url = reverse('notifications-marquer-lue', args=[self.notif_proprietaire_a.id])

        response = self._client(self.employe).post(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.notif_proprietaire_a.refresh_from_db()
        self.assertFalse(self.notif_proprietaire_a.lue)

    def test_marquer_lue_refuse_pour_une_notification_dune_autre_boutique(self):
        url = reverse('notifications-marquer-lue', args=[self.notif_b.id])

        response = self._client(self.proprietaire).post(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
