from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from categories.models import Categorie
from .models import Produit


class ProduitCategorieIsolationTests(APITestCase):
    """Sécurité : un produit ne doit jamais pouvoir être rattaché à la
    catégorie d'une autre boutique."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b")

        self.user_a = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.categorie_a = Categorie.objects.create(boutique=self.boutique_a, nom="Categorie A")
        self.categorie_b = Categorie.objects.create(boutique=self.boutique_b, nom="Categorie B")

        self.url_list = reverse('produit-list')

        self.payload_base = {
            "nom": "Produit test",
            "prix_achat": "100.00",
            "prix_unitaire": "150.00",
            "prix_douzaine": "1500.00",
            "quantite_en_stock": 0,
        }

    def test_creation_produit_avec_categorie_autre_boutique_refusee(self):
        self.client.force_authenticate(user=self.user_b)
        payload = {**self.payload_base, "categorie": self.categorie_a.id}
        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Produit.objects.filter(boutique=self.boutique_b).count(), 0)

    def test_creation_produit_avec_categorie_propre_boutique_autorisee(self):
        self.client.force_authenticate(user=self.user_b)
        payload = {**self.payload_base, "categorie": self.categorie_b.id}
        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        produit = Produit.objects.get(pk=response.data['id'])
        self.assertEqual(produit.categorie_id, self.categorie_b.id)

    def test_modification_produit_vers_categorie_autre_boutique_refusee(self):
        self.client.force_authenticate(user=self.user_b)
        produit = Produit.objects.create(
            boutique=self.boutique_b, categorie=self.categorie_b, nom="Produit B",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        url_detail = reverse('produit-detail', args=[produit.id])
        response = self.client.patch(url_detail, {"categorie": self.categorie_a.id}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        produit.refresh_from_db()
        self.assertEqual(produit.categorie_id, self.categorie_b.id)
