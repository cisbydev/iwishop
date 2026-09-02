import threading
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from products.models import Produit, UniteVente, ProduitPrix
from .models import MouvementStock


class MouvementStockIsolationTests(APITestCase):
    """Sécurité : un utilisateur ne doit jamais pouvoir créer/modifier un
    mouvement de stock sur le produit d'une autre boutique."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b")

        self.user_a = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.produit_a = Produit.objects.create(
            boutique=self.boutique_a, nom="Produit A",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )
        self.produit_b = Produit.objects.create(
            boutique=self.boutique_b, nom="Produit B",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )

        self.url_list = reverse('mouvements-stock-list')

    def test_creation_mouvement_sur_produit_autre_boutique_refusee(self):
        """B ne peut pas créer un mouvement de stock sur le produit de A."""
        self.client.force_authenticate(user=self.user_b)
        payload = {
            "produit": self.produit_a.id,
            "type_mouvement": "ENTREE",
            "quantite": 5,
        }
        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MouvementStock.objects.count(), 0)
        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, 10)

    def test_creation_mouvement_sur_produit_propre_boutique_autorisee(self):
        """B peut créer un mouvement de stock sur son propre produit."""
        self.client.force_authenticate(user=self.user_b)
        payload = {
            "produit": self.produit_b.id,
            "type_mouvement": "ENTREE",
            "quantite": 5,
        }
        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit_b.refresh_from_db()
        self.assertEqual(self.produit_b.quantite_en_stock, 15)

    def test_modification_mouvement_vers_produit_autre_boutique_refusee(self):
        """B ne peut pas réassigner un de ses mouvements vers le produit de A
        (de toute façon bloqué en amont : la modification est interdite,
        cf. MouvementStockImmutabilityTests)."""
        self.client.force_authenticate(user=self.user_b)
        mouvement = MouvementStock.objects.create(
            boutique=self.boutique_b, produit=self.produit_b,
            type_mouvement='ENTREE', quantite=5,
        )
        url_detail = reverse('mouvements-stock-detail', args=[mouvement.id])
        response = self.client.patch(url_detail, {"produit": self.produit_a.id}, format='json')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        mouvement.refresh_from_db()
        self.assertEqual(mouvement.produit_id, self.produit_b.id)


class MouvementStockImmutabilityTests(APITestCase):
    """Sécurité/intégrité : un mouvement de stock déjà créé ne doit jamais
    pouvoir être modifié ou supprimé, car ni PUT/PATCH ni DELETE ne
    recalculent Produit.quantite_en_stock - les autoriser désynchroniserait
    silencieusement le stock réel de son historique."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )
        self.mouvement = MouvementStock.objects.create(
            boutique=self.boutique, produit=self.produit,
            type_mouvement='ENTREE', quantite=5,
        )
        self.client.force_authenticate(user=self.user)
        self.url_detail = reverse('mouvements-stock-detail', args=[self.mouvement.id])

    def test_put_refuse(self):
        response = self.client.put(self.url_detail, {
            "produit": self.produit.id, "type_mouvement": "ENTREE", "quantite": 999,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.mouvement.refresh_from_db()
        self.assertEqual(self.mouvement.quantite, 5)

    def test_patch_refuse(self):
        response = self.client.patch(self.url_detail, {"quantite": 999}, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.mouvement.refresh_from_db()
        self.assertEqual(self.mouvement.quantite, 5)

    def test_delete_refuse(self):
        response = self.client.delete(self.url_detail)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(MouvementStock.objects.filter(pk=self.mouvement.id).exists())

    def test_lecture_toujours_autorisee(self):
        """list/retrieve doivent rester accessibles : seules l'écriture après
        coup et la suppression sont interdites."""
        response = self.client.get(self.url_detail)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.get(reverse('mouvements-stock-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ConcurrenceVenteEtMouvementStockTests(APITransactionTestCase):
    """P1 point 7 : une vente et une sortie de stock manuelle simultanées
    sur le même produit ne doivent jamais survendre le stock disponible -
    preuve que le verrou (select_for_update) porte bien sur le Produit
    lui-même, et protège donc entre deux chemins de code différents, pas
    seulement entre deux appels du même endpoint.

    APITransactionTestCase (et non APITestCase) est nécessaire : il faut
    de vraies transactions committées pour que deux threads avec des
    connexions séparées se voient réellement en concurrence."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-concurrence-mixte")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=5,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))

    def _vendre(self, quantite, resultats, cle):
        client = APIClient()
        client.force_authenticate(user=self.user)
        payload = {
            "montant_paye": str(Decimal(quantite) * Decimal("100.00")),
            "lignes": [{
                "produit": self.produit.id, "quantite": quantite,
                "type_vente": "UNITE", "prix_applique": "100.00",
            }],
        }
        try:
            resultats[cle] = client.post(reverse('ventes-list'), payload, format='json')
        finally:
            connection.close()

    def _sortie_stock(self, quantite, resultats, cle):
        client = APIClient()
        client.force_authenticate(user=self.user)
        payload = {"produit": self.produit.id, "type_mouvement": "SORTIE", "quantite": quantite}
        try:
            resultats[cle] = client.post(reverse('mouvements-stock-list'), payload, format='json')
        finally:
            connection.close()

    def test_vente_et_sortie_stock_simultanees_ne_survendent_pas(self):
        # Stock = 5. Une vente de 4 et une sortie manuelle de 3 en
        # simultané : 4+3=7 > 5, une seule des deux doit passer.
        resultats = {}
        t1 = threading.Thread(target=self._vendre, args=(4, resultats, 'vente'))
        t2 = threading.Thread(target=self._sortie_stock, args=(3, resultats, 'sortie'))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        codes = {resultats['vente'].status_code, resultats['sortie'].status_code}
        self.assertEqual(
            codes, {status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST},
            f"vente={resultats['vente'].status_code} ({resultats['vente'].data}), "
            f"sortie={resultats['sortie'].status_code} ({resultats['sortie'].data})"
        )

        quantite_gagnante = 4 if resultats['vente'].status_code == status.HTTP_201_CREATED else 3
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 5 - quantite_gagnante)


class MouvementStockTracabiliteTests(APITestCase):
    """P2 point 16 : un mouvement de stock doit enregistrer l'employé qui
    l'a effectué, comme Vente.utilisateur."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-tracabilite-mouvement")
        self.user = User.objects.create_user(username="caissier", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=False)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )
        self.client.force_authenticate(user=self.user)

    def test_utilisateur_enregistre_a_la_creation(self):
        payload = {"produit": self.produit.id, "type_mouvement": "ENTREE", "quantite": 5}
        response = self.client.post(reverse('mouvements-stock-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mouvement = MouvementStock.objects.get(pk=response.data['id'])
        self.assertEqual(mouvement.utilisateur_id, self.user.id)
        self.assertEqual(response.data['utilisateur_nom'], 'caissier')

    def test_utilisateur_soumis_dans_le_payload_est_ignore(self):
        """`utilisateur` est en lecture seule : impossible d'attribuer un
        mouvement à quelqu'un d'autre que l'appelant."""
        autre = User.objects.create_user(username="autre_employe", password="pass1234")
        payload = {
            "produit": self.produit.id, "type_mouvement": "ENTREE", "quantite": 5,
            "utilisateur": autre.id,
        }
        response = self.client.post(reverse('mouvements-stock-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mouvement = MouvementStock.objects.get(pk=response.data['id'])
        self.assertEqual(mouvement.utilisateur_id, self.user.id)


class MouvementStockAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir créer de mouvement de stock manuel.
    MouvementStockViewSet.perform_create() est surchargé (verrouillage +
    mise à jour du stock) et ne passait par AUCUN contrôle d'accès - pas
    même `boutique.actif`."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-mouvement")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('mouvements-stock-list')
        self.payload = {"produit": self.produit.id, "type_mouvement": "ENTREE", "quantite": 5}

    def test_creation_refusee_si_abonnement_expire(self):
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

        response = self.client.post(self.url_list, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.assertEqual(MouvementStock.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_creation_autorisee_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout doit
        continuer à créer des mouvements de stock normalement."""
        response = self.client.post(self.url_list, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 15)


class MouvementStockQuantiteInvalideTests(APITestCase):
    """Audit complémentaire point 2 : une quantité négative inversait le
    sens de l'opération - une ENTREE retirait du stock (démontré :
    quantite=-5 sur un stock de 10 le faisait passer à 5), une SORTIE en
    ajoutait (stock 10 -> 15). AJUSTEMENT n'est pas concerné : il fixe une
    valeur absolue et 0 y est légitime (déjà protégé contre le négatif,
    vérifié ici en non-régression)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-quantite-invalide-mouvement")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('mouvements-stock-list')

    def _tenter_mouvement(self, type_mouvement, quantite):
        return self.client.post(self.url_list, {
            "produit": self.produit.id, "type_mouvement": type_mouvement, "quantite": quantite,
        }, format='json')

    def test_entree_quantite_negative_refusee_stock_inchange(self):
        """Reproduit exactement la faille démontrée : une ENTREE avec
        quantite=-5 ne doit plus retirer du stock."""
        response = self._tenter_mouvement('ENTREE', -5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MouvementStock.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_entree_quantite_nulle_refusee(self):
        response = self._tenter_mouvement('ENTREE', 0)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MouvementStock.objects.count(), 0)

    def test_entree_quantite_positive_toujours_autorisee(self):
        """Non-régression."""
        response = self._tenter_mouvement('ENTREE', 5)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 15)

    def test_sortie_quantite_negative_refusee_stock_inchange(self):
        """Reproduit exactement la faille démontrée : une SORTIE avec
        quantite=-5 ne doit plus ajouter du stock."""
        response = self._tenter_mouvement('SORTIE', -5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MouvementStock.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_sortie_quantite_nulle_refusee(self):
        response = self._tenter_mouvement('SORTIE', 0)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MouvementStock.objects.count(), 0)

    def test_sortie_quantite_positive_toujours_autorisee(self):
        """Non-régression."""
        response = self._tenter_mouvement('SORTIE', 5)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 5)

    def test_ajustement_quantite_nulle_toujours_autorisee(self):
        """Non-régression : AJUSTEMENT à 0 reste légitime (stock réel
        constaté nul), le nouveau contrôle ne doit pas y toucher."""
        response = self._tenter_mouvement('AJUSTEMENT', 0)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 0)

    def test_ajustement_quantite_negative_toujours_refusee(self):
        """Non-régression : la protection déjà existante pour AJUSTEMENT
        (dans la vue) continue de fonctionner."""
        response = self._tenter_mouvement('AJUSTEMENT', -5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)


class MouvementStockListQueryCountTests(APITestCase):
    """Audit point 13 : utilisateur_nom (MouvementStockSerializer) faisait
    encore une requête par mouvement listé malgré le select_related('produit')
    déjà en place."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-n1-mouvements")
        self.user = User.objects.create_user(username="user_n1_mouvements", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('mouvements-stock-list')

    def _creer_mouvements(self, n):
        for i in range(n):
            produit = Produit.objects.create(
                boutique=self.boutique, nom=f"Produit {i}",
                prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            )
            MouvementStock.objects.create(
                boutique=self.boutique, produit=produit, type_mouvement='ENTREE',
                quantite=5, utilisateur=self.user,
            )

    def test_nombre_de_requetes_constant_quel_que_soit_le_nombre_de_mouvements(self):
        # Réauthentifie avec une instance User fraîche avant CHAQUE appel :
        # self.user (construit dans setUp) a son .profil.boutique mis en
        # cache gratuitement dès la construction, ce qu'une vraie requête
        # HTTP n'a jamais - sans ce rafraîchissement systématique, seul le
        # premier appel refléterait ce coût réel.
        self._creer_mouvements(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            response_1 = self.client.get(self.url_list)

        self._creer_mouvements(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response_2 = self.client.get(self.url_list)

        self.assertEqual(response_1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_2.data['results']), 7)
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))
