import threading
import time
from copy import deepcopy
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from PIL import ExifTags, Image, ImageCms, ImageFile
from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.storage import InMemoryStorage, default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, connection
from django.test import SimpleTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase, APITransactionTestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from categories.models import Categorie
from inventory.models import MouvementStock
from purchases.models import Achat, LigneAchat
from sales.models import Vente, LigneVente
from .models import Produit, UniteVente, ProduitPrix
from .photos import enregistrer_photo, traiter_photo


UPLOAD_TEST_STORAGES = deepcopy(settings.STORAGES)
UPLOAD_TEST_STORAGES['default'] = {
    'BACKEND': 'django.core.files.storage.InMemoryStorage',
}


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


class ProduitEcritureAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 bis : PATCH/DELETE sur Produit et
    UniteVente n'étaient protégés qu'implicitement par get_queryset()
    (via get_object()) ; ils doivent maintenant appeler _verifier_acces()
    eux-mêmes (perform_update/perform_destroy du mixin) - sans quoi le
    contrôle scindé lecture/écriture réintroduirait la faille déjà fermée
    (audit complémentaire point 1). La lecture (GET), elle, reste permise."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-ecriture-produit")
        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.proprietaire)

        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Kg", facteur_conversion=Decimal("1.000")
        )

        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

    def test_lecture_produit_autorisee_si_abonnement_expire(self):
        response = self.client.get(reverse('produit-detail', args=[self.produit.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_produit_refuse_si_abonnement_expire(self):
        response = self.client.patch(
            reverse('produit-detail', args=[self.produit.id]), {"nom": "Tentative"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.nom, "Produit")

    def test_delete_produit_refuse_si_abonnement_expire(self):
        response = self.client.delete(reverse('produit-detail', args=[self.produit.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Produit.objects.filter(pk=self.produit.id).exists())

    def test_lecture_unite_vente_autorisee_si_abonnement_expire(self):
        response = self.client.get(reverse('unites-vente-detail', args=[self.unite.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_unite_vente_refuse_si_abonnement_expire(self):
        response = self.client.patch(
            reverse('unites-vente-detail', args=[self.unite.id]), {"nom": "Kilogramme"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.unite.refresh_from_db()
        self.assertEqual(self.unite.nom, "Kg")


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
        achat = Achat.objects.create(boutique=self.boutique, montant_paye=0)
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


def _fichiers_stockes(stockage, dossier='produits'):
    """Tous les fichiers du stockage sous `dossier`, sous-dossiers compris :
    on compte les fichiers, jamais les seules réponses de l'API."""
    try:
        dossiers, fichiers = stockage.listdir(dossier)
    except FileNotFoundError:
        return []
    noms = [f'{dossier}/{nom}' for nom in fichiers]
    for sous_dossier in dossiers:
        noms += _fichiers_stockes(stockage, f'{dossier}/{sous_dossier}')
    return sorted(noms)


def _photo_jpeg(taille=(1600, 1200), nom='IMG_0001.jpg'):
    buffer = BytesIO()
    Image.new('RGB', taille, 'red').save(buffer, format='JPEG')
    return SimpleUploadedFile(nom, buffer.getvalue(), content_type='image/jpeg')


class _StockageEnMemoireMixin:
    """Stockage en mémoire neuf pour chaque test (vide au départ)."""

    def _stockage_neuf(self):
        reglages = override_settings(STORAGES=deepcopy(UPLOAD_TEST_STORAGES))
        reglages.enable()
        self.addCleanup(reglages.disable)
        self.assertIsInstance(default_storage, InMemoryStorage)
        self.assertEqual(_fichiers_stockes(default_storage), [])
        return default_storage


class ProduitPhotoApiTests(_StockageEnMemoireMixin, APITestCase):
    """POST et DELETE produits/{id}/photo/ (D4 à D6) : photo contrôlée,
    ré-encodée et rangée par boutique ; ancien fichier supprimé après le
    commit ; mêmes refus que toute écriture sur un produit."""

    MESSAGE_FORMAT = "Format d'image non accepté. Choisissez une photo JPG ou PNG."

    def setUp(self):
        self.stockage = self._stockage_neuf()
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-photo-api")
        self.proprietaire = User.objects.create_user(username="proprio_photo", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.employe = User.objects.create_user(username="employe_photo", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        self.url = reverse('produit-photo', args=[self.produit.id])
        self.chemin_attendu = rf'^produits/{self.boutique.id}/[0-9a-f]{{32}}\.webp$'

    def _envoyer(self, fichier=None, user=None, **extra):
        self.client.force_authenticate(user=user or self.proprietaire)
        return self.client.post(self.url, {'photo': fichier or _photo_jpeg()}, format='multipart', **extra)

    def _retirer(self, user=None, **extra):
        self.client.force_authenticate(user=user or self.proprietaire)
        return self.client.delete(self.url, **extra)

    def _photo_en_place(self):
        """Photo déjà enregistrée par l'API."""
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._envoyer().status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        return self.produit.photo.name

    def test_envoi_enregistre_un_webp_800_px_dans_le_dossier_de_la_boutique(self):
        response = self._envoyer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        nom = self.produit.photo.name
        self.assertRegex(nom, self.chemin_attendu)
        self.assertEqual(_fichiers_stockes(self.stockage), [nom])
        with self.stockage.open(nom) as fichier:
            image = Image.open(fichier)
            self.assertEqual((image.format, image.size), ('WEBP', (800, 600)))
        self.assertTrue(response.data['photo'].endswith(nom))

    def test_nom_du_fichier_envoye_jamais_utilise(self):
        buffer = BytesIO()
        Image.new('RGB', (50, 50), 'red').save(buffer, format='PNG')
        fichier = SimpleUploadedFile('../../x.php.jpg', buffer.getvalue(), content_type='image/jpeg')

        response = self._envoyer(fichier)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertRegex(self.produit.photo.name, self.chemin_attendu)
        self.assertNotIn('php', self.produit.photo.name)

    def test_remplacement_supprime_l_ancien_fichier_seulement_apres_le_commit(self):
        ancien = self._photo_en_place()

        with self.captureOnCommitCallbacks() as callbacks:
            response = self._envoyer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        nouveau = self.produit.photo.name
        self.assertNotEqual(nouveau, ancien)
        # Avant le commit, les deux fichiers sont encore là.
        self.assertEqual(_fichiers_stockes(self.stockage), sorted([ancien, nouveau]))
        for callback in callbacks:
            callback()
        self.assertEqual(_fichiers_stockes(self.stockage), [nouveau])

    def test_echec_de_la_base_supprime_le_nouveau_fichier_et_garde_l_ancien(self):
        ancien = self._photo_en_place()

        with self.captureOnCommitCallbacks() as callbacks:
            with patch.object(Produit, 'save', side_effect=DatabaseError("panne simulée")):
                with self.assertRaises(DatabaseError):
                    self._envoyer()

        self.assertEqual(callbacks, [])
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.photo.name, ancien)
        self.assertEqual(_fichiers_stockes(self.stockage), [ancien])

    def test_retrait_supprime_le_fichier(self):
        self._photo_en_place()

        with self.captureOnCommitCallbacks(execute=True):
            response = self._retirer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['photo'])
        self.produit.refresh_from_db()
        self.assertFalse(self.produit.photo)
        self.assertEqual(_fichiers_stockes(self.stockage), [])

    def test_retrait_sans_photo_ne_fait_rien(self):
        with self.captureOnCommitCallbacks() as callbacks:
            response = self._retirer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(callbacks, [])

    def test_suppression_du_produit_supprime_sa_photo(self):
        self._photo_en_place()
        self.client.force_authenticate(user=self.proprietaire)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(reverse('produit-detail', args=[self.produit.id]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(_fichiers_stockes(self.stockage), [])

    def test_suppression_refusee_du_produit_garde_sa_photo(self):
        nom = self._photo_en_place()
        MouvementStock.objects.create(
            boutique=self.boutique, produit=self.produit, type_mouvement='ENTREE', quantite=5,
        )
        self.client.force_authenticate(user=self.proprietaire)

        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            response = self.client.delete(reverse('produit-detail', args=[self.produit.id]))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(callbacks, [])
        self.assertEqual(_fichiers_stockes(self.stockage), [nom])

    def test_echec_de_suppression_dans_le_stockage_journalise_sans_bloquer(self):
        ancien = self._photo_en_place()

        with patch.object(InMemoryStorage, 'delete', side_effect=OSError("R2 injoignable")):
            with self.assertLogs('products.photos', level='ERROR') as journaux:
                with self.captureOnCommitCallbacks(execute=True):
                    response = self._envoyer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(ancien, journaux.output[0])
        # Au pire, l'ancien fichier reste orphelin.
        self.assertEqual(len(_fichiers_stockes(self.stockage)), 2)

    def test_fichiers_refuses_400_avec_message_sans_rien_stocker(self):
        buffer = BytesIO()
        Image.new('RGB', (10, 10)).save(buffer, format='GIF')
        cas = [
            ('texte nommé .jpg', fichier_non_image(), self.MESSAGE_FORMAT),
            ('GIF', SimpleUploadedFile('photo.gif', buffer.getvalue(), content_type='image/gif'), self.MESSAGE_FORMAT),
            ('plus de 5 Mo', image_trop_lourde(), "L'image ne doit pas dépasser 5 Mo."),
        ]
        for libelle, fichier, message in cas:
            with self.subTest(libelle):
                response = self._envoyer(fichier)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data, [message])

        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.post(self.url, {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, ["Aucune photo envoyée."])

        self.produit.refresh_from_db()
        self.assertFalse(self.produit.photo)
        self.assertEqual(_fichiers_stockes(self.stockage), [])

    def test_produit_d_une_autre_boutique_meme_404_qu_un_produit_inexistant(self):
        boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-photo-api-b")
        user_b = User.objects.create_user(username="proprio_photo_b", password="pass1234")
        Profil.objects.create(user=user_b, boutique=boutique_b, est_proprietaire=True)
        nom = self._photo_en_place()
        inexistant = reverse('produit-photo', args=[Produit.objects.order_by('-pk').first().pk + 1000])
        self.client.force_authenticate(user=user_b)

        for methode in ('post', 'delete'):
            with self.subTest(methode):
                envoi = getattr(self.client, methode)
                autre = envoi(self.url, {'photo': _photo_jpeg()}, format='multipart')
                absent = envoi(inexistant, {'photo': _photo_jpeg()}, format='multipart')
                self.assertEqual(autre.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual((autre.status_code, autre.data), (absent.status_code, absent.data))

        self.produit.refresh_from_db()
        self.assertEqual(self.produit.photo.name, nom)
        self.assertEqual(_fichiers_stockes(self.stockage), [nom])

    def test_vue_support_refusee(self):
        nom = self._photo_en_place()
        admin = User.objects.create_superuser(username="admin_photo", email="admin@example.com", password="x")
        entete = {'HTTP_X_SUPPORT_BOUTIQUE': str(self.boutique.id)}

        for response in (self._envoyer(user=admin, **entete), self._retirer(user=admin, **entete)):
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(response.data['detail'], "La Vue Support est en lecture seule.")

        self.produit.refresh_from_db()
        self.assertEqual(self.produit.photo.name, nom)
        self.assertEqual(_fichiers_stockes(self.stockage), [nom])

    def test_abonnement_expire_refuse(self):
        nom = self._photo_en_place()
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

        for response in (self._envoyer(), self._retirer()):
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(response.data['code'], 'ABONNEMENT_EXPIRE')

        self.produit.refresh_from_db()
        self.assertEqual(self.produit.photo.name, nom)
        self.assertEqual(_fichiers_stockes(self.stockage), [nom])

    def test_employe_peut_envoyer_et_retirer(self):
        self.assertEqual(self._envoyer(user=self.employe).status_code, status.HTTP_200_OK)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._retirer(user=self.employe).status_code, status.HTTP_200_OK)
        self.assertEqual(_fichiers_stockes(self.stockage), [])


class ProduitPhotoLectureSeuleTests(_StockageEnMemoireMixin, APITestCase):
    """D5 : dans le produit, `photo` est en lecture seule (son URL). Une
    photo envoyée avec le produit est ignorée : elle ne passerait par
    aucun des contrôles de traiter_photo."""

    def setUp(self):
        self.stockage = self._stockage_neuf()
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-photo-lecture-seule")
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

    def test_photo_envoyee_avec_le_produit_ignoree(self):
        response = self.client.post(self.url_list, self._payload(photo=image_valide()), format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['photo'])
        self.assertEqual(_fichiers_stockes(self.stockage), [])

    def test_modification_du_produit_garde_sa_photo(self):
        produit = Produit.objects.get(pk=self.client.post(self.url_list, self._payload(), format='json').data['id'])
        self.client.post(reverse('produit-photo', args=[produit.id]), {'photo': _photo_jpeg()}, format='multipart')
        produit.refresh_from_db()
        nom = produit.photo.name
        self.assertTrue(nom)
        url_detail = reverse('produit-detail', args=[produit.id])

        # PUT sans photo, comme le formulaire du frontend.
        put = self.client.put(url_detail, self._payload(nom="Renommé"), format='json')
        patch_ = self.client.patch(url_detail, {'photo': image_valide()}, format='multipart')

        self.assertEqual((put.status_code, patch_.status_code), (status.HTTP_200_OK, status.HTTP_200_OK))
        produit.refresh_from_db()
        self.assertEqual((produit.nom, produit.photo.name), ("Renommé", nom))
        self.assertEqual(_fichiers_stockes(self.stockage), [nom])

    def test_creation_sans_photo_toujours_autorisee(self):
        response = self.client.post(self.url_list, self._payload(), format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_liste_avec_photos_nombre_de_requetes_constant(self):
        def creer(n):
            for i in range(n):
                Produit.objects.create(
                    boutique=self.boutique, nom=f"Produit {i}-{n}", photo=f"produits/{self.boutique.id}/{i}-{n}.webp",
                    prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
                )

        # Utilisateur relu avant chaque appel : voir ProduitListQueryCountTests.
        creer(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            self.client.get(self.url_list)
        creer(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response = self.client.get(self.url_list)

        self.assertEqual(len(response.data['results']), 7)
        self.assertTrue(all(p['photo'] for p in response.data['results']))
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))


class ProduitPhotoConcurrenceTests(_StockageEnMemoireMixin, APITransactionTestCase):
    """Deux envois simultanés sur le même produit, avec deux vraies
    connexions PostgreSQL : le premier s'arrête juste avant d'enregistrer
    (verrou pris), le second doit attendre, puis lire le nouveau fichier du
    premier comme « ancien » et le supprimer. Sans le verrou, les deux
    liraient le même ancien fichier, et l'un des nouveaux resterait
    orphelin dans le stockage."""

    def setUp(self):
        self.stockage = self._stockage_neuf()
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-photo-concurrence")
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("100"), prix_unitaire=Decimal("150"), prix_douzaine=Decimal("1500"),
        )
        self.octets = traiter_photo(_photo_jpeg(taille=(20, 20)))
        enregistrer_photo(self.produit, self.octets)

    def _attente_sur_verrou(self, pid):
        with connection.cursor() as cursor:
            cursor.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", [pid])
            ligne = cursor.fetchone()
        return ligne is not None and ligne[0] == 'Lock'

    def _envoyer(self, cle, resultats, pids=None):
        try:
            if pids is not None:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid()")
                    pids.append(cursor.fetchone()[0])
            enregistrer_photo(Produit.objects.get(pk=self.produit.pk), self.octets)
            resultats[cle] = 'ok'
        except Exception as erreur:
            resultats[cle] = repr(erreur)
        finally:
            connection.close()

    def test_deux_envois_simultanes_aucun_fichier_orphelin(self):
        save_original = Produit.save
        en_pause, liberer = threading.Event(), threading.Event()
        appels, resultats, pid_b = [], {}, []

        def save_avec_pause(instance, *args, **kwargs):
            appels.append(1)
            if len(appels) == 1:
                en_pause.set()
                liberer.wait(timeout=10)
            return save_original(instance, *args, **kwargs)

        with patch.object(Produit, 'save', autospec=True, side_effect=save_avec_pause):
            thread_a = threading.Thread(target=self._envoyer, args=('a', resultats))
            thread_a.start()
            self.assertTrue(en_pause.wait(timeout=10), resultats)

            thread_b = threading.Thread(target=self._envoyer, args=('b', resultats, pid_b))
            thread_b.start()
            limite = time.monotonic() + 10
            b_bloque = False
            while time.monotonic() < limite and thread_b.is_alive():
                if pid_b and self._attente_sur_verrou(pid_b[0]):
                    b_bloque = True
                    break
                time.sleep(0.01)

            liberer.set()
            thread_a.join(timeout=15)
            thread_b.join(timeout=15)

        self.assertTrue(b_bloque, f"Le second envoi aurait dû attendre le verrou : {resultats}")
        self.assertEqual(resultats, {'a': 'ok', 'b': 'ok'})
        self.produit.refresh_from_db()
        self.assertEqual(_fichiers_stockes(self.stockage), [self.produit.photo.name])


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


def _fichier_image(image, format_, nom='photo.jpg', **options):
    buffer = BytesIO()
    image.save(buffer, format=format_, **options)
    return SimpleUploadedFile(nom, buffer.getvalue())


def _relire(octets):
    image = Image.open(BytesIO(octets))
    image.load()
    return image


class TraiterPhotoTests(SimpleTestCase):
    """traiter_photo (plan validé le 2026-10-15, D1 à D3) : contrôle de la
    photo envoyée, puis WebP, 800 px au plus, orientation appliquée,
    métadonnées supprimées."""

    def test_grande_photo_reduite_a_800_px_en_webp(self):
        octets = traiter_photo(_fichier_image(Image.new('RGB', (3000, 2000), 'red'), 'JPEG'))

        sortie = _relire(octets)
        self.assertEqual(sortie.format, 'WEBP')
        self.assertEqual(sortie.size, (800, 533))

    def test_photo_en_hauteur_garde_ses_proportions(self):
        sortie = _relire(traiter_photo(_fichier_image(Image.new('RGB', (1000, 2000), 'red'), 'JPEG')))

        self.assertEqual(sortie.size, (400, 800))

    def test_petite_photo_jamais_agrandie(self):
        sortie = _relire(traiter_photo(_fichier_image(Image.new('RGB', (300, 200), 'red'), 'JPEG')))

        self.assertEqual(sortie.size, (300, 200))

    def test_cote_max_reglable(self):
        sortie = _relire(traiter_photo(
            _fichier_image(Image.new('RGB', (1600, 1200), 'red'), 'JPEG'), cote_max=320,
        ))

        self.assertEqual(sortie.size, (320, 240))

    def test_carre_recadre_au_centre(self):
        # Trois bandes verticales : bleu, rouge, vert. Le carré central ne
        # garde que la bande rouge.
        image = Image.new('RGB', (300, 100), 'blue')
        image.paste('red', (100, 0, 200, 100))
        image.paste('green', (200, 0, 300, 100))

        sortie = _relire(traiter_photo(_fichier_image(image, 'PNG', nom='bandes.png'), cote_max=320, carre=True))

        self.assertEqual(sortie.size, (100, 100))
        for point in ((2, 2), (97, 2), (50, 50), (2, 97), (97, 97)):
            rouge, vert, bleu = sortie.getpixel(point)[:3]
            self.assertGreater(rouge, 200, point)
            self.assertLess(vert, 60, point)
            self.assertLess(bleu, 60, point)

    def test_carre_reduit_a_cote_max(self):
        sortie = _relire(traiter_photo(
            _fichier_image(Image.new('RGB', (1600, 1200), 'red'), 'JPEG'), cote_max=320, carre=True,
        ))

        self.assertEqual(sortie.size, (320, 320))

    def test_exif_et_position_gps_supprimes(self):
        exif = Image.Exif()
        exif[ExifTags.Base.Make] = "Appareil de test"
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps[ExifTags.GPS.GPSLatitudeRef] = 'N'
        gps[ExifTags.GPS.GPSLatitude] = (12.0, 39.0, 0.0)
        icc = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        fichier = _fichier_image(Image.new('RGB', (100, 100), 'red'), 'JPEG', exif=exif, icc_profile=icc)
        source = Image.open(BytesIO(fichier.read()))
        self.assertIn(ExifTags.GPS.GPSLatitude, source.getexif().get_ifd(ExifTags.IFD.GPSInfo))
        self.assertIn('icc_profile', source.info)

        sortie = _relire(traiter_photo(fichier))

        self.assertEqual(len(sortie.getexif()), 0)
        for cle in ('exif', 'xmp', 'icc_profile'):
            self.assertNotIn(cle, sortie.info)

    def test_orientation_exif_appliquee(self):
        # Photo prise téléphone tourné : 200 x 100 en pixels, orientation 6
        # (90° dans le sens horaire), affichée 100 x 200.
        exif = Image.Exif()
        exif[ExifTags.Base.Orientation] = 6
        fichier = _fichier_image(Image.new('RGB', (200, 100), 'red'), 'JPEG', exif=exif)

        sortie = _relire(traiter_photo(fichier))

        self.assertEqual(sortie.size, (100, 200))
        self.assertEqual(len(sortie.getexif()), 0)

    def test_transparence_gardee(self):
        image = Image.new('RGBA', (20, 20), (0, 0, 255, 255))
        image.putpixel((0, 0), (0, 0, 0, 0))

        sortie = _relire(traiter_photo(_fichier_image(image, 'PNG', nom='logo.png')))

        self.assertEqual(sortie.mode, 'RGBA')
        self.assertEqual(sortie.getpixel((0, 0))[3], 0)
        self.assertEqual(sortie.getpixel((10, 10))[3], 255)

    def test_photo_cmjn_convertie(self):
        sortie = _relire(traiter_photo(_fichier_image(Image.new('CMYK', (50, 50)), 'JPEG')))

        self.assertEqual(sortie.mode, 'RGB')

    def test_vrai_type_png_nomme_jpg_accepte(self):
        fichier = _fichier_image(Image.new('RGB', (50, 50), 'red'), 'PNG', nom='photo.jpg')

        self.assertEqual(_relire(traiter_photo(fichier)).format, 'WEBP')

    def test_formats_refuses_avec_le_message_de_d2(self):
        gif = _fichier_image(Image.new('RGB', (50, 50), 'red'), 'GIF', nom='photo.gif')
        svg = SimpleUploadedFile('photo.svg', b'<svg xmlns="http://www.w3.org/2000/svg"></svg>')
        # En-tête d'un fichier HEIC (boîte « ftyp » de marque « heic ») :
        # Pillow ne sait pas le lire.
        heic = SimpleUploadedFile('IMG_0001.HEIC', b'\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic' + b'\x00' * 64)
        texte = SimpleUploadedFile('photo.jpg', b"pas une image, juste du texte")

        for fichier in (gif, svg, heic, texte):
            with self.subTest(fichier=fichier.name):
                with self.assertRaisesMessage(ValidationError, "Format d'image non accepté. Choisissez une photo JPG ou PNG."):
                    traiter_photo(fichier)

    def test_fichier_trop_lourd_refuse(self):
        fichier = SimpleUploadedFile('photo.jpg', b'\x00' * (5 * 1024 * 1024 + 1))

        with self.assertRaisesMessage(ValidationError, "L'image ne doit pas dépasser 5 Mo."):
            traiter_photo(fichier)

    def test_plus_de_40_megapixels_refuse_avant_decodage(self):
        # 8000 x 6000 = 48 mégapixels, en noir et blanc 1 bit : fichier
        # léger, mais refusé sur ses dimensions, lues dans l'en-tête.
        fichier = _fichier_image(Image.new('1', (8000, 6000)), 'PNG', nom='photo.png')

        # ImageFile.load (et non Image.load) : c'est elle qui décode un
        # fichier ouvert par Image.open.
        with patch.object(ImageFile.ImageFile, 'load', side_effect=AssertionError("décodage avant le contrôle")):
            with self.assertRaisesMessage(ValidationError, "L'image est trop grande (40 mégapixels au plus)."):
                traiter_photo(fichier)

    def test_bombe_de_decompression_refusee(self):
        # Au-delà du double de Image.MAX_IMAGE_PIXELS, Pillow refuse dès
        # l'ouverture (DecompressionBombError) : même message, pas de 500.
        fichier = _fichier_image(Image.new('RGB', (100, 100), 'red'), 'PNG', nom='photo.png')

        with patch.object(Image, 'MAX_IMAGE_PIXELS', 1000):
            with self.assertRaisesMessage(ValidationError, "L'image est trop grande (40 mégapixels au plus)."):
                traiter_photo(fichier)

    def test_image_tronquee_refusee(self):
        complete = _fichier_image(Image.new('RGB', (200, 200), 'red'), 'JPEG').read()
        fichier = SimpleUploadedFile('photo.jpg', complete[: len(complete) // 2])

        with self.assertRaisesMessage(ValidationError, "Image illisible ou incomplète. Choisissez une autre photo."):
            traiter_photo(fichier)

    def test_image_animee_premiere_image_seulement(self):
        rouge, bleue = Image.new('RGB', (40, 40), (255, 0, 0)), Image.new('RGB', (40, 40), (0, 0, 255))
        fichier = _fichier_image(rouge, 'WEBP', nom='anim.webp', save_all=True, append_images=[bleue], lossless=True)
        self.assertEqual(Image.open(BytesIO(fichier.read())).n_frames, 2)

        sortie = _relire(traiter_photo(fichier))

        self.assertEqual(getattr(sortie, 'n_frames', 1), 1)
        r, g, b = sortie.convert('RGB').getpixel((20, 20))
        self.assertGreater(r, 200)
        self.assertLess(b, 50)
