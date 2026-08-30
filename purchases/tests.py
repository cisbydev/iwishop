from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from suppliers.models import Fournisseur
from products.models import Produit, UniteVente
from inventory.models import MouvementStock
from .models import Achat


class AchatFournisseurIsolationTests(APITestCase):
    """Sécurité : un achat ne doit jamais pouvoir référencer le fournisseur
    d'une autre boutique."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b")

        self.user_a = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.fournisseur_a = Fournisseur.objects.create(boutique=self.boutique_a, nom="Fournisseur A")
        self.fournisseur_b = Fournisseur.objects.create(boutique=self.boutique_b, nom="Fournisseur B")

        self.produit_b = Produit.objects.create(
            boutique=self.boutique_b, nom="Produit B",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=0,
        )
        self.unite_b = UniteVente.objects.create(
            boutique=self.boutique_b, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )

        self.url_list = reverse('achats-list')
        self.lignes_valides = [{
            "produit": self.produit_b.id,
            "quantite": 3,
            "unite": self.unite_b.id,
            "prix_unitaire_achat": "100.00",
        }]

    def test_creation_achat_avec_fournisseur_autre_boutique_refusee(self):
        self.client.force_authenticate(user=self.user_b)
        payload = {"fournisseur": self.fournisseur_a.id, "lignes": self.lignes_valides}
        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fournisseur', response.data)
        self.assertEqual(Achat.objects.count(), 0)
        self.produit_b.refresh_from_db()
        self.assertEqual(self.produit_b.quantite_en_stock, 0)

    def test_creation_achat_avec_fournisseur_propre_boutique_autorisee(self):
        self.client.force_authenticate(user=self.user_b)
        payload = {"fournisseur": self.fournisseur_b.id, "lignes": self.lignes_valides}
        response = self.client.post(self.url_list, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.fournisseur_id, self.fournisseur_b.id)
