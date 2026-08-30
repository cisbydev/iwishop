from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from products.models import Produit
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
