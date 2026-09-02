from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from categories.models import Categorie
from inventory.models import MouvementStock
from purchases.models import Achat, LigneAchat
from sales.models import Vente, LigneVente
from .models import Produit, UniteVente, ProduitPrix


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


class ProduitDestroyPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut supprimer un produit ;
    la création/modification restent ouvertes à l'employé (non-régression)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-produit")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        self.url_detail = reverse('produit-detail', args=[self.produit.id])

    def test_employe_ne_peut_pas_supprimer(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Produit.objects.filter(pk=self.produit.id).exists())

    def test_employe_peut_toujours_creer_et_modifier(self):
        """Non-régression : création et modification restent ouvertes à l'employé."""
        self.client.force_authenticate(user=self.employe)
        payload = {
            "nom": "Nouveau produit", "prix_achat": "100.00",
            "prix_unitaire": "150.00", "prix_douzaine": "1500.00",
        }
        response = self.client.post(reverse('produit-list'), payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.patch(self.url_detail, {"nom": "Produit renommé"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_proprietaire_peut_supprimer(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Produit.objects.filter(pk=self.produit.id).exists())


class ProduitDestroyProtegeParHistoriqueTests(APITestCase):
    """P2 point 15 : supprimer un produit ne doit jamais effacer
    silencieusement l'historique (ventes, achats, mouvements de stock) qui
    le référence. `Produit` était référencé en CASCADE partout, ce qui
    contournait complètement l'immutabilité/l'annulabilité déjà mises en
    place pour Vente/Achat/MouvementStock (P0) : il suffisait de supprimer
    le produit pour effacer leur historique sans jamais passer par leurs
    propres garde-fous."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-protection-produit")
        self.proprietaire = User.objects.create_user(username="proprio_hist", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )

    def _creer_produit(self, nom):
        return Produit.objects.create(
            boutique=self.boutique, nom=nom,
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
            quantite_en_stock=10,
        )

    def _supprimer(self, produit):
        self.client.force_authenticate(user=self.proprietaire)
        return self.client.delete(reverse('produit-detail', args=[produit.id]))

    def test_suppression_refusee_si_lie_a_une_vente(self):
        produit = self._creer_produit("Produit vendu")
        vente = Vente.objects.create(boutique=self.boutique, montant_paye=Decimal("150"))
        LigneVente.objects.create(
            boutique=self.boutique, vente=vente, produit=produit, quantite=1,
            unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
            prix_applique=Decimal("150"),
        )

        response = self._supprimer(produit)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Produit.objects.filter(pk=produit.id).exists())
        self.assertTrue(LigneVente.objects.filter(produit=produit).exists())

    def test_suppression_refusee_si_lie_a_un_achat(self):
        produit = self._creer_produit("Produit acheté")
        achat = Achat.objects.create(boutique=self.boutique)
        LigneAchat.objects.create(
            boutique=self.boutique, achat=achat, produit=produit, quantite=5,
            unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
            prix_unitaire_achat=Decimal("100"),
        )

        response = self._supprimer(produit)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Produit.objects.filter(pk=produit.id).exists())
        self.assertTrue(LigneAchat.objects.filter(produit=produit).exists())

    def test_suppression_refusee_si_lie_a_un_mouvement_stock(self):
        produit = self._creer_produit("Produit avec mouvement")
        MouvementStock.objects.create(
            boutique=self.boutique, produit=produit, type_mouvement='ENTREE', quantite=5,
        )

        response = self._supprimer(produit)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Produit.objects.filter(pk=produit.id).exists())
        self.assertTrue(MouvementStock.objects.filter(produit=produit).exists())

    def test_suppression_toujours_possible_sans_historique(self):
        """Non-régression : un produit sans historique lié reste supprimable
        (déjà couvert par ProduitDestroyPermissionTests, reconfirmé ici dans
        le même contexte que les cas bloqués ci-dessus)."""
        produit = self._creer_produit("Produit sans historique")

        response = self._supprimer(produit)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Produit.objects.filter(pk=produit.id).exists())


class UniteVenteDestroyPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut supprimer une unité de vente."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-unite")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Kg", facteur_conversion=Decimal("1.000")
        )
        self.url_detail = reverse('unites-vente-detail', args=[self.unite.id])

    def test_employe_ne_peut_pas_supprimer(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(UniteVente.objects.filter(pk=self.unite.id).exists())

    def test_proprietaire_peut_supprimer(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UniteVente.objects.filter(pk=self.unite.id).exists())


class ProduitPrixDestroyPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut supprimer un prix produit."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-prix")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Kg", facteur_conversion=Decimal("1.000")
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        self.produit_prix = ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("120"))
        self.url_detail = reverse('produit-prix-detail', args=[self.produit_prix.id])

    def test_employe_ne_peut_pas_supprimer(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ProduitPrix.objects.filter(pk=self.produit_prix.id).exists())

    def test_proprietaire_peut_supprimer(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProduitPrix.objects.filter(pk=self.produit_prix.id).exists())
