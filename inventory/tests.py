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
