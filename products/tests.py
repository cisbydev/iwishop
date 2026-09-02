from decimal import Decimal
from io import BytesIO

from PIL import Image
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from categories.models import Categorie
from inventory.models import MouvementStock
from purchases.models import Achat, LigneAchat
from sales.models import Vente, LigneVente
from .models import Produit, UniteVente, ProduitPrix


def image_valide(nom='photo.png', taille=(10, 10)):
    """Petite image PNG valide et légère, pour les tests d'upload."""
    buffer = BytesIO()
    Image.new('RGB', taille, color='blue').save(buffer, format='PNG')
    buffer.seek(0)
    return SimpleUploadedFile(nom, buffer.read(), content_type='image/png')


def image_trop_lourde(nom='photo.png'):
    """Image PNG valide mais dépassant 5 Mo (compress_level=0 : pas de
    compression zlib, la taille du fichier reste proche des pixels bruts)."""
    buffer = BytesIO()
    Image.new('RGB', (2000, 2000), color='red').save(buffer, format='PNG', compress_level=0)
    buffer.seek(0)
    return SimpleUploadedFile(nom, buffer.read(), content_type='image/png')


def fichier_non_image(nom='photo.jpg'):
    """Fichier texte renommé avec une extension d'image - jamais une
    vraie image, quel que soit son nom."""
    return SimpleUploadedFile(nom, b"pas une image, juste du texte", content_type='image/jpeg')


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


class ProduitPrixAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir créer/modifier un prix produit.
    ProduitPrixViewSet.perform_create()/perform_update() ne vérifiaient
    que `boutique.actif`, codé en dur, jamais `abonnement_valide()`."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-prix")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Kg", facteur_conversion=Decimal("1.000")
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        self.client.force_authenticate(user=self.user)

    def _expirer_abonnement(self):
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

    def test_creation_refusee_si_abonnement_expire(self):
        self._expirer_abonnement()
        payload = {"produit": self.produit.id, "unite": self.unite.id, "prix": "120.00"}

        response = self.client.post(reverse('produit-prix-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.assertFalse(ProduitPrix.objects.filter(produit=self.produit, unite=self.unite).exists())

    def test_modification_refusee_si_abonnement_expire(self):
        produit_prix = ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))
        self._expirer_abonnement()

        response = self.client.patch(
            reverse('produit-prix-detail', args=[produit_prix.id]), {"prix": "130.00"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        produit_prix.refresh_from_db()
        self.assertEqual(produit_prix.prix, Decimal("100"))

    def test_creation_autorisee_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout doit
        continuer à créer des prix normalement."""
        payload = {"produit": self.produit.id, "unite": self.unite.id, "prix": "120.00"}

        response = self.client.post(reverse('produit-prix-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ProduitPrixNegatifTests(APITestCase):
    """Audit point 3 : un prix négatif n'a pas de sens et fausserait le
    calcul du bénéfice (Rapports/Tableau de bord). Un bénéfice CALCULÉ
    négatif (prix_achat > prix de vente) reste, lui, parfaitement légitime -
    seule la SAISIE d'un prix négatif est bloquée ici, pas le résultat d'un
    calcul (voir reports.tests.ResumeFinancierBeneficeNegatifTests)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-prix-negatif")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
        )

    def _payload(self, **overrides):
        payload = {
            "nom": "Produit test", "prix_achat": "100.00",
            "prix_unitaire": "150.00", "prix_douzaine": "1500.00",
        }
        payload.update(overrides)
        return payload

    def test_creation_prix_achat_negatif_refusee(self):
        response = self.client.post(reverse('produit-list'), self._payload(prix_achat="-10.00"), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_creation_prix_unitaire_negatif_refusee(self):
        response = self.client.post(reverse('produit-list'), self._payload(prix_unitaire="-10.00"), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_creation_prix_douzaine_negatif_refusee(self):
        response = self.client.post(reverse('produit-list'), self._payload(prix_douzaine="-10.00"), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_prix_achat_negatif_refuse(self):
        response = self.client.patch(
            reverse('produit-detail', args=[self.produit.id]), {"prix_achat": "-5.00"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("50"))

    def test_creation_prix_zero_toujours_autorisee(self):
        """Non-régression : un prix à zéro (produit offert...) reste permis,
        seul le négatif est bloqué."""
        response = self.client.post(reverse('produit-list'), self._payload(prix_achat="0.00"), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_creation_prix_positif_toujours_autorisee(self):
        """Non-régression : une création normale reste possible."""
        response = self.client.post(reverse('produit-list'), self._payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_creation_produitprix_negatif_refusee(self):
        response = self.client.post(
            reverse('produit-prix-list'),
            {"produit": self.produit.id, "unite": self.unite.id, "prix": "-1.00"},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ProduitPrix.objects.filter(produit=self.produit, unite=self.unite).exists())

    def test_creation_produitprix_positif_toujours_autorisee(self):
        """Non-régression : une création normale reste possible."""
        response = self.client.post(
            reverse('produit-prix-list'),
            {"produit": self.produit.id, "unite": self.unite.id, "prix": "120.00"},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ProduitStockNegatifTests(APITestCase):
    """Audit point 3 (trouvaille complémentaire testée en production) : un
    stock négatif (quantite_en_stock ou stock_minimum) n'a aucun sens
    métier, même si les ventes suivantes échouent déjà avec "stock
    insuffisant" - rien n'empêchait de créer/modifier un produit avec un
    stock initial négatif (ex: -50)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-stock-negatif")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10, stock_minimum=5,
        )

    def _payload(self, **overrides):
        payload = {
            "nom": "Produit test", "prix_achat": "100.00",
            "prix_unitaire": "150.00", "prix_douzaine": "1500.00",
        }
        payload.update(overrides)
        return payload

    def test_creation_quantite_en_stock_negative_refusee(self):
        """Reproduit exactement la faille démontrée : un stock initial de
        -50 ne doit plus pouvoir être créé."""
        response = self.client.post(reverse('produit-list'), self._payload(quantite_en_stock=-50), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_creation_stock_minimum_negatif_refusee(self):
        response = self.client.post(reverse('produit-list'), self._payload(stock_minimum=-1), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_quantite_en_stock_negative_refuse(self):
        response = self.client.patch(
            reverse('produit-detail', args=[self.produit.id]), {"quantite_en_stock": -50}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_patch_stock_minimum_negatif_refuse(self):
        response = self.client.patch(
            reverse('produit-detail', args=[self.produit.id]), {"stock_minimum": -1}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.stock_minimum, 5)

    def test_creation_stock_zero_toujours_autorisee(self):
        """Non-régression : un stock à zéro (rupture, nouveau produit pas
        encore approvisionné) reste permis, seul le négatif est bloqué."""
        response = self.client.post(
            reverse('produit-list'),
            self._payload(quantite_en_stock=0, stock_minimum=0),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_creation_stock_positif_toujours_autorisee(self):
        """Non-régression : une création normale reste possible."""
        response = self.client.post(
            reverse('produit-list'),
            self._payload(quantite_en_stock=20, stock_minimum=3),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_patch_stock_positif_toujours_autorise(self):
        """Non-régression : un réajustement de stock normal reste possible."""
        response = self.client.patch(
            reverse('produit-detail', args=[self.produit.id]), {"quantite_en_stock": 25}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 25)


class ProduitReferenceUniciteParBoutiqueTests(APITestCase):
    """Audit point 9 : Produit.reference était unique GLOBALEMENT plutôt
    que par boutique - deux boutiques différentes ne pouvaient pas
    utiliser le même schéma de référence (ex: "SKU-001"). Passé en
    unique_together (boutique, reference). Vérifie aussi que
    CurrentBoutiqueDefault() (nécessaire pour la validation DRF) ne
    transforme pas un doublon dans la MÊME boutique en IntegrityError non
    gérée (500) au lieu d'un 400 propre."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a-unicite-reference")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b-unicite-reference")

        self.user_a = User.objects.create_user(username="user_a_reference", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b_reference", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.url_list = reverse('produit-list')
        self.payload_base = {
            "nom": "Produit test", "prix_achat": "100.00",
            "prix_unitaire": "150.00", "prix_douzaine": "1500.00",
        }

    def test_deux_boutiques_peuvent_utiliser_la_meme_reference(self):
        """Reproduit exactement le scénario bloqué avant la correction."""
        Produit.objects.create(
            boutique=self.boutique_a, reference="SKU-001", nom="Produit A",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
        )

        self.client.force_authenticate(user=self.user_b)
        response = self.client.post(
            self.url_list, {**self.payload_base, "reference": "SKU-001"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Produit.objects.filter(reference="SKU-001").count(), 2)

    def test_meme_boutique_deux_produits_meme_reference_refusee_400_pas_500(self):
        """La contrainte doit rester active DANS une même boutique - et
        remonter une 400 propre (validateur DRF), pas une IntegrityError
        non gérée."""
        Produit.objects.create(
            boutique=self.boutique_a, reference="SKU-001", nom="Produit A",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
        )

        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            self.url_list, {**self.payload_base, "reference": "SKU-001"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Produit.objects.filter(boutique=self.boutique_a, reference="SKU-001").count(), 1)

    def test_reference_omise_toujours_auto_generee_sans_collision(self):
        """Non-régression : le chemin historique (référence non fournie,
        auto-générée en UUID) continue de fonctionner pour plusieurs
        produits de la même boutique, sans jamais déclencher le
        validateur d'unicité (comme avant cette correction)."""
        self.client.force_authenticate(user=self.user_a)

        reponse_1 = self.client.post(self.url_list, self.payload_base, format='json')
        reponse_2 = self.client.post(self.url_list, self.payload_base, format='json')

        self.assertEqual(reponse_1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(reponse_2.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(reponse_1.data['reference'], reponse_2.data['reference'])


class ProduitPhotoUploadTests(APITestCase):
    """Audit point 10 : Produit.photo n'avait ni limite de taille ni de
    format - seul le contenu réellement décodable comme image (Pillow,
    via ImageField) était vérifié."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-photo-upload")
        self.user = User.objects.create_user(username="user_photo", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('produit-list')

    def _payload(self, **overrides):
        payload = {
            "nom": "Produit test", "prix_achat": "100.00",
            "prix_unitaire": "150.00", "prix_douzaine": "1500.00",
        }
        payload.update(overrides)
        return payload

    def test_upload_extension_non_autorisee_refuse(self):
        """Une vraie image, mais dans un format hors liste blanche (GIF)."""
        buffer = BytesIO()
        Image.new('RGB', (10, 10)).save(buffer, format='GIF')
        buffer.seek(0)
        fichier = SimpleUploadedFile('photo.gif', buffer.read(), content_type='image/gif')

        response = self.client.post(self.url_list, self._payload(photo=fichier), format='multipart')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_fichier_non_image_refuse(self):
        """Non-régression : un fichier renommé en .jpg mais qui n'est pas
        une vraie image reste rejeté (vérification de contenu, pas juste
        de nom - déjà assurée par Pillow via ImageField avant ce correctif)."""
        response = self.client.post(
            self.url_list, self._payload(photo=fichier_non_image()), format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_trop_lourd_refuse(self):
        response = self.client.post(
            self.url_list, self._payload(photo=image_trop_lourde()), format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_image_valide_toujours_autorise(self):
        """Non-régression : une image normale (bon format, taille
        raisonnable) reste acceptée."""
        response = self.client.post(
            self.url_list, self._payload(photo=image_valide()), format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_creation_sans_photo_toujours_autorisee(self):
        """Non-régression : la photo reste optionnelle."""
        response = self.client.post(self.url_list, self._payload(), format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ProduitListQueryCountTests(APITestCase):
    """Audit point 13 : categorie_nom (ProduitSerializer) faisait une
    requête par produit listé sans select_related('categorie') - le
    nombre de requêtes doit rester constant, pas proportionnel au nombre
    de produits."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-n1-produits")
        self.user = User.objects.create_user(username="user_n1_produits", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('produit-list')

    def _creer_produits(self, n):
        for i in range(n):
            categorie = Categorie.objects.create(boutique=self.boutique, nom=f"Categorie {i}-{n}")
            Produit.objects.create(
                boutique=self.boutique, nom=f"Produit {i}-{n}", categorie=categorie,
                prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            )

    def test_nombre_de_requetes_constant_quel_que_soit_le_nombre_de_produits(self):
        # Réauthentifie avec une instance User fraîche avant CHAQUE appel :
        # self.user (construit dans setUp avec l'objet Profil/Boutique déjà
        # en mémoire) a son .profil.boutique mis en cache gratuitement dès
        # la construction, ce qu'une vraie requête HTTP n'a jamais - sans ce
        # rafraîchissement, seul le premier appel refléterait ce coût réel.
        self._creer_produits(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            response_1 = self.client.get(self.url_list)

        self._creer_produits(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response_2 = self.client.get(self.url_list)

        self.assertEqual(response_1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_2.data['results']), 7)
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))


class ProduitPrixListQueryCountTests(APITestCase):
    """Audit point 13 : produit_nom/unite_nom (ProduitPrixSerializer)
    faisaient deux requêtes par ligne listée sans select_related."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-n1-produitprix")
        self.user = User.objects.create_user(username="user_n1_produitprix", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('produit-prix-list')

    def _creer_prix(self, n):
        for i in range(n):
            unite = UniteVente.objects.create(
                boutique=self.boutique, nom=f"Unite {i}-{n}", facteur_conversion=Decimal("1.000")
            )
            produit = Produit.objects.create(
                boutique=self.boutique, nom=f"Produit {i}-{n}",
                prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            )
            ProduitPrix.objects.create(produit=produit, unite=unite, prix=Decimal("100"))

    def test_nombre_de_requetes_constant_quel_que_soit_le_nombre_de_prix(self):
        # Réauthentifie avec une instance User fraîche avant CHAQUE appel
        # (voir commentaire équivalent dans ProduitListQueryCountTests).
        self._creer_prix(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            self.client.get(self.url_list)

        self._creer_prix(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response_2 = self.client.get(self.url_list)

        self.assertEqual(len(response_2.data['results']), 7)
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))


class PaginationListeTests(APITestCase):
    """Audit point 13 (pagination) : les listes ne renvoyaient auparavant
    aucune pagination - l'historique d'une vraie boutique finirait par
    produire des réponses de taille non bornée. PageNumberPagination
    (PAGE_SIZE=50) borne désormais chaque page."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-pagination")
        self.user = User.objects.create_user(username="user_pagination", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

        for i in range(55):
            Produit.objects.create(
                boutique=self.boutique, nom=f"Produit {i}",
                prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            )

    def test_premiere_page_limitee_a_50_avec_count_et_next(self):
        response = self.client.get(reverse('produit-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 55)
        self.assertEqual(len(response.data['results']), 50)
        self.assertIsNotNone(response.data['next'])
        self.assertIsNone(response.data['previous'])

    def test_deuxieme_page_recupere_le_reste(self):
        response = self.client.get(reverse('produit-list'), {'page': 2})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 5)
        self.assertIsNone(response.data['next'])
        self.assertIsNotNone(response.data['previous'])
