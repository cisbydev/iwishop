from decimal import Decimal
from datetime import timedelta
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase, APIClient

from tenants.models import Boutique, Profil
from products.models import Produit, ProduitPrix, UniteVente
from suppliers.models import Fournisseur
from sales.models import Client as ClientCredit, StatutPaiement, Vente
from .models import DestinataireNotification, Notification, TypeNotification
from .services import SEUIL_DETTE_RETARD_JOURS, verifier_dettes_en_retard


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


class VerificationStockBasTests(APITestCase):
    """V2 étape 11 : notifications.services.verifier_stock_bas() câblée aux
    5 points de mutation de Produit.quantite_en_stock identifiés à
    l'investigation (étape 9)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique Stock Bas", slug="boutique-stock-bas")
        self.user = User.objects.create_user(username="stock_bas_user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur Test")

        self.client.force_authenticate(user=self.user)

    def _produit(self, stock, stock_minimum=5):
        produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit Stock Bas",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=stock, stock_minimum=stock_minimum,
        )
        ProduitPrix.objects.create(produit=produit, unite=self.unite, prix=Decimal("100"))
        return produit

    def _notifications_stock_bas(self, produit):
        return Notification.objects.filter(produit=produit, type_notification=TypeNotification.STOCK_BAS)

    def _creer_vente(self, produit, quantite):
        payload = {
            "montant_paye": "1000000.00",
            "lignes": [{"produit": produit.id, "quantite": quantite, "type_vente": "UNITE", "prix_applique": "100.00"}],
        }
        response = self.client.post(reverse('ventes-list'), payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data['id']

    def _creer_achat(self, produit, quantite):
        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{"produit": produit.id, "quantite": quantite, "unite": self.unite.id, "prix_unitaire_achat": "50.00"}],
        }
        response = self.client.post(reverse('achats-list'), payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data['id']

    # --- 1. VenteSerializer.create() ---

    def test_vente_sous_le_seuil_cree_une_notification_puis_naccumule_pas(self):
        produit = self._produit(stock=10, stock_minimum=5)

        self._creer_vente(produit, quantite=6)  # 10 - 6 = 4 <= 5
        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 4)
        self.assertEqual(self._notifications_stock_bas(produit).filter(lue=False).count(), 1)

        # Deuxième vente : le stock s'enfonce encore plus bas, mais aucune
        # deuxième notification ne doit être créée (anti-spam).
        self._creer_vente(produit, quantite=2)  # 4 - 2 = 2 <= 5
        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 2)
        self.assertEqual(self._notifications_stock_bas(produit).filter(lue=False).count(), 1)

    # --- 2. VenteViewSet.annuler() ---

    def test_annulation_vente_qui_restaure_le_stock_au_dessus_du_seuil_marque_la_notification_lue(self):
        produit = self._produit(stock=10, stock_minimum=5)
        vente_id = self._creer_vente(produit, quantite=7)  # 10 - 7 = 3 <= 5
        produit.refresh_from_db()
        notif = self._notifications_stock_bas(produit).get()
        self.assertFalse(notif.lue)

        response = self.client.post(reverse('ventes-annuler', args=[vente_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 10)  # restauré, > 5
        notif.refresh_from_db()
        self.assertTrue(notif.lue)

    # --- 3. AchatSerializer.create() ---

    def test_achat_qui_remonte_le_stock_au_dessus_du_seuil_marque_la_notification_lue(self):
        produit = self._produit(stock=3, stock_minimum=5)  # déjà sous le seuil à la création
        # Aucune vérification n'a encore eu lieu pour ce produit (création
        # directe en base) : on simule l'alerte déjà levée par une mutation
        # antérieure, comme un vrai flux le ferait.
        notif = Notification.objects.create(
            boutique=self.boutique, type_notification=TypeNotification.STOCK_BAS,
            message="Stock bas initial", produit=produit,
            destinataire_role=DestinataireNotification.TOUS,
        )

        self._creer_achat(produit, quantite=10)  # 3 + 10 = 13 > 5

        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 13)
        notif.refresh_from_db()
        self.assertTrue(notif.lue)

    # --- 4. AchatViewSet.annuler() ---

    def test_annulation_achat_qui_redescend_le_stock_sous_le_seuil_cree_une_notification(self):
        produit = self._produit(stock=3, stock_minimum=5)  # sous le seuil, jamais encore vérifié
        achat_id = self._creer_achat(produit, quantite=10)  # 3 + 10 = 13 > 5, pas de notification
        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 13)
        self.assertEqual(self._notifications_stock_bas(produit).count(), 0)

        response = self.client.post(reverse('achats-annuler', args=[achat_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 3)  # revenu sous le seuil
        self.assertEqual(self._notifications_stock_bas(produit).filter(lue=False).count(), 1)

    # --- 5. MouvementStockViewSet.perform_create() ---

    def test_ajustement_manuel_cree_puis_resout_une_notification(self):
        produit = self._produit(stock=10, stock_minimum=5)
        url = reverse('mouvements-stock-list')

        response = self.client.post(
            url, {"produit": produit.id, "type_mouvement": "AJUSTEMENT", "quantite": 2}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 2)
        notif = self._notifications_stock_bas(produit).get()
        self.assertFalse(notif.lue)

        response = self.client.post(
            url, {"produit": produit.id, "type_mouvement": "AJUSTEMENT", "quantite": 8}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        produit.refresh_from_db()
        self.assertEqual(produit.quantite_en_stock, 8)
        notif.refresh_from_db()
        self.assertTrue(notif.lue)


class VerificationDettesEnRetardTests(TestCase):
    """V2 étape 12 : notifications.services.verifier_dettes_en_retard(),
    déclenchée quotidiennement via le management command
    verifier_dettes_en_retard (cron externe, cf. étape suivante)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique Dette Retard", slug="boutique-dette-retard")
        self.client_credit = ClientCredit.objects.create(
            boutique=self.boutique, nom="Client Retard", telephone="0100000000"
        )

    def _vente_credit(self, montant_du, anciennete_jours):
        vente = Vente.objects.create(
            boutique=self.boutique, client_credit=self.client_credit,
            montant_paye=0, montant_total=1000, montant_net=1000,
            montant_du=montant_du,
            statut_paiement=StatutPaiement.PAYE if montant_du == 0 else StatutPaiement.EN_ATTENTE,
        )
        # date_vente est auto_now_add=True : passe par une mise à jour en
        # base (bypass du auto_now_add) plutôt qu'une valeur au create().
        date_anciennete = timezone.now() - timedelta(days=anciennete_jours)
        Vente.objects.filter(pk=vente.pk).update(date_vente=date_anciennete)
        vente.refresh_from_db()
        return vente

    def _notifications_dette_retard(self, vente):
        return Notification.objects.filter(vente=vente, type_notification=TypeNotification.DETTE_RETARD)

    def test_vente_en_retard_avec_dette_cree_une_notification(self):
        vente = self._vente_credit(montant_du=1000, anciennete_jours=SEUIL_DETTE_RETARD_JOURS + 1)

        resultat = verifier_dettes_en_retard()

        self.assertEqual(resultat['creees'], 1)
        notif = self._notifications_dette_retard(vente).get()
        self.assertFalse(notif.lue)
        self.assertEqual(notif.destinataire_role, DestinataireNotification.PROPRIETAIRE)
        self.assertIn('Client Retard', notif.message)

    def test_reexecution_sans_changement_ne_cree_pas_de_deuxieme_notification(self):
        vente = self._vente_credit(montant_du=1000, anciennete_jours=SEUIL_DETTE_RETARD_JOURS + 1)

        verifier_dettes_en_retard()
        resultat = verifier_dettes_en_retard()  # "le lendemain", rien n'a changé

        self.assertEqual(resultat['creees'], 0)
        self.assertEqual(self._notifications_dette_retard(vente).filter(lue=False).count(), 1)

    def test_vente_soldee_entre_temps_marque_la_notification_lue(self):
        vente = self._vente_credit(montant_du=1000, anciennete_jours=SEUIL_DETTE_RETARD_JOURS + 1)
        verifier_dettes_en_retard()
        notif = self._notifications_dette_retard(vente).get()
        self.assertFalse(notif.lue)

        vente.montant_du = 0
        vente.statut_paiement = StatutPaiement.PAYE
        vente.save(update_fields=['montant_du', 'statut_paiement'])

        resultat = verifier_dettes_en_retard()

        self.assertEqual(resultat['resolues'], 1)
        notif.refresh_from_db()
        self.assertTrue(notif.lue)

    def test_vente_recente_ne_cree_pas_de_notification(self):
        self._vente_credit(montant_du=1000, anciennete_jours=SEUIL_DETTE_RETARD_JOURS - 1)

        resultat = verifier_dettes_en_retard()

        self.assertEqual(resultat['creees'], 0)
        self.assertEqual(Notification.objects.filter(type_notification=TypeNotification.DETTE_RETARD).count(), 0)

    def test_command_sur_base_vide_ne_plante_pas(self):
        sortie = StringIO()

        call_command('verifier_dettes_en_retard', stdout=sortie)

        self.assertIn('0 notification(s) créée(s)', sortie.getvalue())
        self.assertIn('0 notification(s) résolue(s)', sortie.getvalue())

    def test_command_cree_bien_les_notifications_via_le_service(self):
        vente = self._vente_credit(montant_du=1000, anciennete_jours=SEUIL_DETTE_RETARD_JOURS + 1)
        sortie = StringIO()

        call_command('verifier_dettes_en_retard', stdout=sortie)

        self.assertIn('1 notification(s) créée(s)', sortie.getvalue())
        self.assertEqual(self._notifications_dette_retard(vente).count(), 1)
