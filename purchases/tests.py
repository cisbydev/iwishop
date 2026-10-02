import threading
import time
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Sum
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from suppliers.models import Fournisseur
from products.models import Produit, UniteVente, ProduitPrix
from inventory.models import MouvementStock
from sales.models import LigneVente
from .models import Achat, LigneAchat, PaiementFournisseur
from .services.dette import corriger_paiement, enregistrer_paiement


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

    def test_modification_achat_vers_fournisseur_autre_boutique_refusee(self):
        """La modification est de toute façon interdite (405, cf.
        AchatAnnulationTests) - donc a fortiori impossible de réassigner le
        fournisseur vers une autre boutique."""
        self.client.force_authenticate(user=self.user_b)
        achat = Achat.objects.create(boutique=self.boutique_b, fournisseur=self.fournisseur_b, montant_paye=0)
        url_detail = reverse('achats-detail', args=[achat.id])
        response = self.client.patch(url_detail, {"fournisseur": self.fournisseur_a.id}, format='json')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        achat.refresh_from_db()
        self.assertEqual(achat.fournisseur_id, self.fournisseur_b.id)


class AchatAnnulationTests(APITestCase):
    """P0 n°4 : un achat validé ne se modifie ni ne se supprime ; il
    s'annule via une écriture inverse qui retire le stock ajouté."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b")

        self.user_a = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.fournisseur_a = Fournisseur.objects.create(boutique=self.boutique_a, nom="Fournisseur A")
        self.unite_a = UniteVente.objects.create(
            boutique=self.boutique_a, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit_a = Produit.objects.create(
            boutique=self.boutique_a, nom="Produit A",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10,
        )

        self.client.force_authenticate(user=self.user_a)
        self.url_list = reverse('achats-list')

        payload = {
            "fournisseur": self.fournisseur_a.id,
            "lignes": [{
                "produit": self.produit_a.id, "quantite": 5,
                "unite": self.unite_a.id, "prix_unitaire_achat": "60.00",
            }],
        }
        response = self.client.post(self.url_list, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        self.achat_id = response.data['id']
        self.achat = Achat.objects.get(pk=self.achat_id)

        self.produit_a.refresh_from_db()
        assert self.produit_a.quantite_en_stock == 15  # 10 + 5

        self.url_detail = reverse('achats-detail', args=[self.achat_id])
        self.url_annuler = reverse('achats-annuler', args=[self.achat_id])

    def test_put_refuse(self):
        response = self.client.put(self.url_detail, {"notes": "x"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_delete_refuse(self):
        response = self.client.delete(self.url_detail)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Achat.objects.filter(pk=self.achat_id).exists())

    def test_annulation_retire_stock_et_cree_mouvement(self):
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.achat.refresh_from_db()
        self.assertEqual(self.achat.statut, 'ANNULE')

        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, 10)  # restauré exactement

        mouvement = MouvementStock.objects.latest('id')
        self.assertEqual(mouvement.produit_id, self.produit_a.id)
        self.assertEqual(mouvement.type_mouvement, 'SORTIE')
        self.assertEqual(mouvement.quantite, 5)
        self.assertEqual(mouvement.motif, f"Annulation Achat #{self.achat.id}")

    def test_double_annulation_refusee_sans_double_retrait(self):
        self.client.post(self.url_annuler)
        self.produit_a.refresh_from_db()
        stock_apres_premiere = self.produit_a.quantite_en_stock
        nb_mouvements_apres_premiere = MouvementStock.objects.count()

        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, stock_apres_premiere)
        self.assertEqual(MouvementStock.objects.count(), nb_mouvements_apres_premiere)

    def test_annulation_refusee_si_stock_insuffisant(self):
        """Si une partie du stock acheté a déjà été revendue, on ne peut
        pas annuler l'achat (ça ferait passer le stock sous zéro)."""
        self.produit_a.quantite_en_stock = 2
        self.produit_a.save()

        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.achat.refresh_from_db()
        self.assertEqual(self.achat.statut, 'VALIDE')
        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, 2)

    def test_rapport_financier_exclut_achat_annule(self):
        url_resume = reverse('resume-financier')

        avant = self.client.get(url_resume).data
        self.assertEqual(Decimal(str(avant['total_achats'])), Decimal("300.00"))  # 5 x 60
        self.assertEqual(avant['nombre_achats'], 1)

        self.client.post(self.url_annuler)

        apres = self.client.get(url_resume).data
        self.assertEqual(Decimal(str(apres['total_achats'])), Decimal("0.00"))
        self.assertEqual(apres['nombre_achats'], 0)

    def test_annulation_par_autre_boutique_refusee(self):
        self.client.force_authenticate(user=self.user_b)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.achat.refresh_from_db()
        self.assertEqual(self.achat.statut, 'VALIDE')
        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, 15)


class AchatAnnulationPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut annuler un achat ; un
    employé peut créer un achat (opération quotidienne) mais pas l'annuler."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-achat")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10,
        )

        # Non-régression : un employé peut créer un achat (opération quotidienne).
        self.client.force_authenticate(user=self.employe)
        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 5,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }
        response = self.client.post(reverse('achats-list'), payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        self.achat_id = response.data['id']
        self.achat = Achat.objects.get(pk=self.achat_id)

        self.produit.refresh_from_db()
        assert self.produit.quantite_en_stock == 15  # 10 + 5

        self.url_annuler = reverse('achats-annuler', args=[self.achat_id])

    def test_employe_ne_peut_pas_annuler(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.achat.refresh_from_db()
        self.assertEqual(self.achat.statut, 'VALIDE')
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 15)  # inchangé

    def test_proprietaire_peut_annuler(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.achat.refresh_from_db()
        self.assertEqual(self.achat.statut, 'ANNULE')
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)  # retiré


class AchatTracabiliteTests(APITestCase):
    """P2 point 16 : un achat doit enregistrer l'employé qui l'a créé,
    comme Vente.utilisateur."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-tracabilite-achat")
        self.user = User.objects.create_user(username="employe_achat", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=False)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=0,
        )
        self.client.force_authenticate(user=self.user)

    def test_utilisateur_enregistre_a_la_creation(self):
        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 3,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }
        response = self.client.post(reverse('achats-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.utilisateur_id, self.user.id)
        self.assertEqual(response.data['utilisateur_nom'], 'employe_achat')

    def test_utilisateur_soumis_dans_le_payload_est_ignore(self):
        autre = User.objects.create_user(username="autre_employe", password="pass1234")
        payload = {
            "fournisseur": self.fournisseur.id,
            "utilisateur": autre.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 3,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }
        response = self.client.post(reverse('achats-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.utilisateur_id, self.user.id)


class AchatAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir créer d'achat. AchatViewSet.perform_create()
    est surchargé et ne passait donc jamais par le contrôle d'accès du
    mixin - la vérification `boutique.actif` du serializer ne couvrait pas
    l'abonnement expiré."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-achat")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=0,
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('achats-list')
        self.payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 3,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }

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
        self.assertEqual(Achat.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 0)

    def test_creation_autorisee_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout doit
        continuer à acheter normalement."""
        response = self.client.post(self.url_list, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 3)

    def test_annulation_refusee_si_abonnement_expire(self):
        """annuler() n'est plus protégé implicitement par get_queryset()
        (lecture toujours permise, audit complémentaire point 1 bis) :
        vérifie l'appel explicite ajouté, sans quoi la faille serait
        réintroduite."""
        achat = Achat.objects.create(boutique=self.boutique, fournisseur=self.fournisseur, montant_paye=0)
        LigneAchat.objects.create(
            boutique=self.boutique, achat=achat, produit=self.produit, quantite=3,
            unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
            prix_unitaire_achat=Decimal("60.00"),
        )
        self.produit.quantite_en_stock = 3
        self.produit.save()

        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

        response = self.client.post(reverse('achats-annuler', args=[achat.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        achat.refresh_from_db()
        self.assertEqual(achat.statut, 'VALIDE')
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 3)


class AchatQuantiteInvalideTests(APITestCase):
    """Audit complémentaire point 2 : une quantité négative sur une ligne
    d'achat inversait le sens de l'opération - au lieu d'ajouter du stock,
    l'achat en retirait (démontré : quantite=-5 sur un stock de 10 le
    faisait passer à 5). Une quantité nulle n'a pas de sens non plus."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-quantite-invalide-achat")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10,
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('achats-list')

    def _tenter_achat(self, quantite):
        return self.client.post(self.url_list, {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": quantite,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }, format='json')

    def test_quantite_negative_refusee_stock_inchange(self):
        """Reproduit exactement la faille démontrée : quantite=-5 ne doit
        plus diminuer le stock au lieu de l'augmenter."""
        response = self._tenter_achat(-5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Achat.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_quantite_nulle_refusee(self):
        response = self._tenter_achat(0)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Achat.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_quantite_positive_toujours_autorisee(self):
        """Non-régression : un achat normal reste possible."""
        response = self._tenter_achat(5)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 15)


class AchatPrixInvalideTests(APITestCase):
    """Audit point 3 : un prix d'achat négatif n'a pas de sens, fausserait
    le stock valorisé (LigneAchat.sous_total, Achat.montant_total) et le
    prix_achat recalculé sur le Produit (donc le bénéfice des Rapports)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-prix-invalide-achat")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10,
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('achats-list')

    def _tenter_achat(self, prix_unitaire_achat):
        return self.client.post(self.url_list, {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 5,
                "unite": self.unite.id, "prix_unitaire_achat": prix_unitaire_achat,
            }],
        }, format='json')

    def test_prix_negatif_refuse_stock_inchange(self):
        response = self._tenter_achat("-60.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Achat.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)
        self.assertEqual(self.produit.prix_achat, Decimal("50"))

    def test_prix_zero_toujours_autorise(self):
        """Non-régression : un achat à prix nul (don, échantillon fournisseur)
        reste un cas légitime, seul le négatif est bloqué."""
        response = self._tenter_achat("0.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_prix_positif_toujours_autorise(self):
        """Non-régression : un achat normal reste possible."""
        response = self._tenter_achat("60.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class AchatListQueryCountTests(APITestCase):
    """Audit point 13 : fournisseur_nom/utilisateur_nom, et surtout les
    lignes imbriquées (produit_nom/unite_nom par ligne), faisaient
    plusieurs requêtes par achat listé sans select_related/prefetch_related.
    Le nombre de requêtes doit rester constant, pas proportionnel au
    nombre d'achats ni de lignes."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-n1-achats")
        self.user = User.objects.create_user(username="user_n1_achats", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000")
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('achats-list')

    def _creer_achats(self, n, lignes_par_achat=2):
        for i in range(n):
            achat = Achat.objects.create(
                boutique=self.boutique, fournisseur=self.fournisseur, utilisateur=self.user, montant_paye=0,
            )
            for j in range(lignes_par_achat):
                produit = Produit.objects.create(
                    boutique=self.boutique, nom=f"Produit {i}-{j}",
                    prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
                )
                LigneAchat.objects.create(
                    boutique=self.boutique, achat=achat, produit=produit, quantite=1,
                    unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
                    prix_unitaire_achat=Decimal("50"),
                )

    def test_nombre_de_requetes_constant_quel_que_soit_le_nombre_dachats(self):
        # Réauthentifie avec une instance User fraîche avant CHAQUE appel :
        # self.user (construit dans setUp) a son .profil.boutique mis en
        # cache gratuitement dès la construction, ce qu'une vraie requête
        # HTTP n'a jamais - sans ce rafraîchissement systématique, seul le
        # premier appel refléterait ce coût réel.
        self._creer_achats(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            response_1 = self.client.get(self.url_list)

        self._creer_achats(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response_2 = self.client.get(self.url_list)

        self.assertEqual(response_1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_2.data['results']), 7)
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))


class AchatAnnulationRestaurationPrixAchatTests(APITestCase):
    """P1 (audit complémentaire) : AchatViewSet.annuler() retirait bien le
    stock mais ne restaurait jamais Produit.prix_achat, qui restait figé
    au prix de l'achat annulé et se retrouvait ensuite gravé sur les
    ventes futures via LigneVente.prix_achat_unitaire (VenteSerializer.
    create()). Stratégie (cf. purchases.views._dernier_prix_achat_valide) :
    recalcul depuis la dernière LigneAchat encore VALIDE pour ce produit,
    jamais depuis l'achat qu'on annule lui-même - 0.00 si plus aucun achat
    valide ne subsiste (pas de valeur inventée, cf. commentaire de la
    fonction)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-restauration-prix-achat")
        self.user = User.objects.create_user(username="proprio_restau", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50.00"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=0,
        )
        self.client.force_authenticate(user=self.user)
        self.url_achats = reverse('achats-list')
        self.url_ventes = reverse('ventes-list')

    def _achat(self, produit, prix_unitaire_achat, quantite=1, unite=None):
        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": produit.id, "quantite": quantite,
                "unite": (unite or self.unite).id, "prix_unitaire_achat": str(prix_unitaire_achat),
            }],
        }
        response = self.client.post(self.url_achats, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data['id']

    def _annuler(self, achat_id):
        return self.client.post(reverse('achats-annuler', args=[achat_id]))

    def test_annulation_restaure_le_prix_de_lachat_precedent(self):
        """achat 500 -> achat 700 -> annulation 700 : doit revenir à 500."""
        self._achat(self.produit, "500.00")
        achat2 = self._achat(self.produit, "700.00")
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("700.00"))

        response = self._annuler(achat2)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("500.00"))

    def test_annulation_du_dernier_achat_dune_chaine_de_trois(self):
        """achats 500 -> 700 -> 900 -> annulation 900 : doit revenir à 700."""
        self._achat(self.produit, "500.00")
        self._achat(self.produit, "700.00")
        achat3 = self._achat(self.produit, "900.00")
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("900.00"))

        self._annuler(achat3)

        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("700.00"))

    def test_annulation_dun_achat_intermediaire_ne_touche_pas_au_prix_si_plus_recent_reste_valide(self):
        """500 -> 700 -> 900, annulation du 700 (intermédiaire) pendant que
        900 reste VALIDE : ne doit surtout PAS remettre 500, le prix
        courant (900) ne dépendait pas de l'achat annulé."""
        self._achat(self.produit, "500.00")
        achat_b = self._achat(self.produit, "700.00")
        self._achat(self.produit, "900.00")
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("900.00"))

        response = self._annuler(achat_b)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("900.00"))

    def test_annulation_avec_plusieurs_produits_restaure_chacun_independamment(self):
        """Un achat annulé touchant 2 produits doit restaurer le prix de
        CHACUN depuis son propre historique, indépendamment de l'autre."""
        produit_b = Produit.objects.create(
            boutique=self.boutique, nom="Produit B",
            prix_achat=Decimal("10.00"), prix_unitaire=Decimal("50"), prix_douzaine=Decimal("600"),
            quantite_en_stock=0,
        )
        self._achat(self.produit, "500.00")
        self._achat(produit_b, "250.00")

        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [
                {"produit": self.produit.id, "quantite": 1, "unite": self.unite.id, "prix_unitaire_achat": "600.00"},
                {"produit": produit_b.id, "quantite": 1, "unite": self.unite.id, "prix_unitaire_achat": "300.00"},
            ],
        }
        response = self.client.post(self.url_achats, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        achat_multi_id = response.data['id']

        self.produit.refresh_from_db()
        produit_b.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("600.00"))
        self.assertEqual(produit_b.prix_achat, Decimal("300.00"))

        response = self._annuler(achat_multi_id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        produit_b.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("500.00"))
        self.assertEqual(produit_b.prix_achat, Decimal("250.00"))

    def test_plusieurs_lignes_du_meme_produit_dans_le_meme_achat(self):
        """Un achat avec 2 lignes pour le même produit : la DERNIÈRE ligne
        traitée fixe le prix à la création (comportement existant,
        inchangé) ; après annulation d'un achat plus récent, la
        restauration doit retomber sur cette même dernière ligne - pas la
        première - de l'achat qui redevient le plus récent valide."""
        payload_achat1 = {
            "fournisseur": self.fournisseur.id,
            "lignes": [
                {"produit": self.produit.id, "quantite": 1, "unite": self.unite.id, "prix_unitaire_achat": "550.00"},
                {"produit": self.produit.id, "quantite": 1, "unite": self.unite.id, "prix_unitaire_achat": "600.00"},
            ],
        }
        response = self.client.post(self.url_achats, payload_achat1, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("600.00"))

        achat2 = self._achat(self.produit, "900.00")
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("900.00"))

        self._annuler(achat2)

        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("600.00"))

    def test_unite_personnalisee_restauration_ramenee_a_lunite_de_stock(self):
        """Le prix restauré doit être ramené à l'unité de stock via le
        facteur_conversion_applique figé sur la ligne historique, pas
        celui, potentiellement différent aujourd'hui, de l'UniteVente."""
        self._achat(self.produit, "600.00")  # Unité, facteur 1 -> prix_achat = 600.00
        sac = UniteVente.objects.create(
            boutique=self.boutique, nom="Sac 25kg", facteur_conversion=Decimal("25.000")
        )
        achat_sac = self._achat(self.produit, "20000.00", quantite=2, unite=sac)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("800.00"))  # 20000 / 25

        response = self._annuler(achat_sac)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("600.00"))

    def test_double_annulation_ne_modifie_pas_le_prix_deja_restaure(self):
        self._achat(self.produit, "500.00")
        achat2 = self._achat(self.produit, "700.00")

        self._annuler(achat2)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("500.00"))

        response = self._annuler(achat2)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("500.00"))

    def test_annulation_refusee_pour_stock_insuffisant_ne_touche_pas_au_prix(self):
        self._achat(self.produit, "500.00")
        achat2 = self._achat(self.produit, "700.00")
        # self.produit est resté figé à sa valeur de setUp (prix_achat=50) :
        # les deux achats l'ont mis à jour en base via l'API, pas via cette
        # instance Python. Rafraîchir AVANT de muter+sauver, sous peine
        # d'écraser le prix_achat réel (700) avec la valeur périmée (50) via
        # ce .save() qui réécrit tous les champs de l'instance.
        self.produit.refresh_from_db()
        # Le stock apporté par achat2 a déjà été revendu entre-temps.
        self.produit.quantite_en_stock = 0
        self.produit.save()

        response = self._annuler(achat2)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("700.00"))

    def test_ancienne_vente_conserve_son_cout_puis_nouvelle_vente_utilise_le_cout_restaure(self):
        """Exigences 2 et 3 réunies : une LigneVente déjà créée ne doit
        jamais être retouchée par une annulation ultérieure d'achat ; une
        vente créée APRÈS l'annulation doit en revanche utiliser le coût
        fraîchement restauré."""
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("1000.00"))

        self._achat(self.produit, "500.00", quantite=5)
        achat2 = self._achat(self.produit, "700.00", quantite=5)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("700.00"))

        response_vente_avant = self.client.post(self.url_ventes, {
            "montant_paye": "1000.00",
            "lignes": [{"produit": self.produit.id, "quantite": 1, "type_vente": "UNITE", "prix_applique": "1000.00"}],
        }, format='json')
        self.assertEqual(response_vente_avant.status_code, status.HTTP_201_CREATED, response_vente_avant.data)
        ligne_avant = LigneVente.objects.get(vente_id=response_vente_avant.data['id'])
        self.assertEqual(ligne_avant.prix_achat_unitaire, Decimal("700.00"))

        response_annulation = self._annuler(achat2)
        self.assertEqual(response_annulation.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("500.00"))

        # La vente déjà enregistrée ne doit jamais être retouchée rétroactivement.
        ligne_avant.refresh_from_db()
        self.assertEqual(ligne_avant.prix_achat_unitaire, Decimal("700.00"))

        # Une nouvelle vente doit utiliser le coût restauré (500), pas l'ancien (700).
        response_vente_apres = self.client.post(self.url_ventes, {
            "montant_paye": "1000.00",
            "lignes": [{"produit": self.produit.id, "quantite": 1, "type_vente": "UNITE", "prix_applique": "1000.00"}],
        }, format='json')
        self.assertEqual(response_vente_apres.status_code, status.HTTP_201_CREATED, response_vente_apres.data)
        ligne_apres = LigneVente.objects.get(vente_id=response_vente_apres.data['id'])
        self.assertEqual(ligne_apres.prix_achat_unitaire, Decimal("500.00"))

    def test_annulation_du_seul_achat_existant_remet_prix_achat_a_zero(self):
        """Exigence 6 : aucun achat valide antérieur ne subsiste -> 0.00,
        jamais une valeur inventée ni le prix (périmé) de l'achat annulé."""
        achat = self._achat(self.produit, "700.00")
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("700.00"))

        response = self._annuler(achat)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("0.00"))


class AchatPaiementComptantTests(APITestCase):
    """Dettes fournisseurs : sans montant_paye dans la requête (frontend
    encore en cache), un achat reste payé comptant - comportement inchangé."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-paiement-achat")
        self.user = User.objects.create_user(username="proprio_paiement", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=0,
        )
        self.client.force_authenticate(user=self.user)

    def test_achat_cree_est_paye_comptant(self):
        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 3,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }
        response = self.client.post(reverse('achats-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.montant_total, Decimal("180.00"))
        self.assertEqual(achat.montant_paye, Decimal("180.00"))
        self.assertEqual(achat.montant_du, Decimal("0.00"))
        self.assertEqual(achat.statut_paiement, 'paye')
        self.assertIsNone(achat.mode_paiement)
        self.assertEqual(response.data['montant_paye'], "180.00")
        self.assertEqual(response.data['montant_du'], "0.00")
        self.assertEqual(response.data['statut_paiement'], 'paye')

    def _inserer_en_sql(self, avec_montant_paye):
        # SQL brut : via le modèle, les default= Python masqueraient un
        # défaut absent en base (cf. CLAUDE.md, Migrations).
        colonnes = ["boutique_id", "fournisseur_id", "utilisateur_id", "date_achat", "montant_total", "notes", "statut"]
        valeurs = [self.boutique.id, self.fournisseur.id, self.user.id, timezone.now(), Decimal("100"), None, 'VALIDE']
        if avec_montant_paye:
            colonnes.append("montant_paye")
            valeurs.append(Decimal("100"))
        with connection.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO {Achat._meta.db_table} ({', '.join(colonnes)}) "
                f"VALUES ({', '.join(['%s'] * len(valeurs))})",
                valeurs,
            )

    def test_db_default_de_statut_paiement_et_montant_du(self):
        # Un INSERT qui n'envoie ni statut_paiement ni montant_du reçoit
        # les défauts de la base (db_default), pas une IntegrityError.
        self._inserer_en_sql(avec_montant_paye=True)

        achats = Achat.objects.filter(boutique=self.boutique)
        self.assertEqual(achats.count(), 1)
        achat = achats.get()
        self.assertEqual(achat.statut_paiement, 'paye')
        self.assertEqual(achat.montant_du, Decimal("0.00"))
        self.assertEqual(achat.montant_paye, Decimal("100.00"))
        self.assertIsNone(achat.mode_paiement)

    def test_insert_sans_montant_paye_refuse(self):
        # Contract (1 bis) : montant_paye est NOT NULL en base. Le code en
        # ligne avant ce déploiement l'envoie toujours (commit 1).
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._inserer_en_sql(avec_montant_paye=False)

        self.assertEqual(Achat.objects.filter(boutique=self.boutique).count(), 0)


class AchatCreditTests(APITestCase):
    """Dettes fournisseurs, achat à crédit : montant_paye (acompte) entre 0
    et montant_total, statut_paiement et montant_du calculés par le
    serveur. D3 : propriétaire seulement. D1 : aucun contrôle de palier."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-credit-achat")
        self.proprio = User.objects.create_user(username="proprio_credit", password="pass1234")
        Profil.objects.create(user=self.proprio, boutique=self.boutique, est_proprietaire=True)
        self.employe = User.objects.create_user(username="employe_credit", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=0,
        )
        self.url_list = reverse('achats-list')
        self.client.force_authenticate(user=self.proprio)

    def _acheter(self, en_tetes=None, **extra):
        # 3 x 60 = 180 de montant_total.
        payload = {
            "fournisseur": self.fournisseur.id,
            "lignes": [{
                "produit": self.produit.id, "quantite": 3,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }
        payload.update(extra)
        return self.client.post(self.url_list, payload, format='json', **(en_tetes or {}))

    def _assert_rien_cree(self):
        self.assertEqual(Achat.objects.filter(boutique=self.boutique).count(), 0)
        self.assertEqual(MouvementStock.objects.filter(boutique=self.boutique).count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 0)

    def _abonnement(self, palier, expire=False):
        formule = FormuleAbonnement.objects.create(nom=palier, duree_jours=30, prix=5000, palier=palier)
        aujourdhui = timezone.localdate()
        if expire:
            debut, fin, statut = aujourdhui - timezone.timedelta(days=40), aujourdhui - timezone.timedelta(days=10), 'EXPIRE'
        else:
            debut, fin, statut = aujourdhui - timezone.timedelta(days=1), aujourdhui + timezone.timedelta(days=29), 'ACTIF'
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule, date_debut=debut, date_fin=fin, statut=statut
        )

    def test_acompte_partiel(self):
        response = self._acheter(montant_paye="50.00", mode_paiement="ESPECES")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['montant_total'], "180.00")
        self.assertEqual(response.data['montant_paye'], "50.00")
        self.assertEqual(response.data['montant_du'], "130.00")
        self.assertEqual(response.data['statut_paiement'], 'partiel')
        self.assertEqual(response.data['mode_paiement'], 'ESPECES')
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.montant_du, Decimal("130.00"))
        self.assertEqual(achat.statut_paiement, 'partiel')
        # Le stock entre comme pour un achat comptant.
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 3)

    def test_sans_acompte_en_attente(self):
        response = self._acheter(montant_paye="0")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.montant_paye, Decimal("0.00"))
        self.assertEqual(achat.montant_du, Decimal("180.00"))
        self.assertEqual(achat.statut_paiement, 'en_attente')
        self.assertIsNone(achat.mode_paiement)

    def test_sans_acompte_mode_null_accepte(self):
        response = self._acheter(montant_paye="0", mode_paiement=None)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(Achat.objects.get(pk=response.data['id']).mode_paiement)

    def test_mode_paiement_sans_acompte_refuse(self):
        # Demande contradictoire : refusée, pas corrigée en silence.
        response = self._acheter(montant_paye="0", mode_paiement="ESPECES")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mode de paiement", str(response.data))
        self._assert_rien_cree()

    def test_montant_paye_egal_au_total_est_comptant(self):
        response = self._acheter(montant_paye="180.00", mode_paiement="MOBILE_MONEY")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.montant_du, Decimal("0.00"))
        self.assertEqual(achat.statut_paiement, 'paye')
        self.assertEqual(achat.mode_paiement, 'MOBILE_MONEY')

    def test_mode_paiement_sans_montant_paye_conserve(self):
        response = self._acheter(mode_paiement="CARTE")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.montant_paye, Decimal("180.00"))
        self.assertEqual(achat.statut_paiement, 'paye')
        self.assertEqual(achat.mode_paiement, 'CARTE')

    def test_montant_paye_superieur_au_total_refuse(self):
        response = self._acheter(montant_paye="180.01")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self._assert_rien_cree()

    def test_montant_paye_negatif_refuse(self):
        response = self._acheter(montant_paye="-1")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self._assert_rien_cree()

    def test_mode_paiement_inconnu_refuse(self):
        response = self._acheter(montant_paye="50", mode_paiement="CHEQUE")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self._assert_rien_cree()

    def test_credit_sans_fournisseur_refuse(self):
        response = self._acheter(fournisseur=None, montant_paye="50")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self._assert_rien_cree()

    def test_comptant_sans_fournisseur_toujours_autorise(self):
        response = self._acheter(fournisseur=None)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_employe_ne_peut_pas_acheter_a_credit(self):
        self.client.force_authenticate(user=self.employe)

        response = self._acheter(montant_paye="50")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self._assert_rien_cree()

    def test_employe_peut_acheter_comptant_avec_montant_paye(self):
        self.client.force_authenticate(user=self.employe)

        response = self._acheter(montant_paye="180", mode_paiement="ESPECES")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_proprietaire_ailleurs_employe_ici_refuse(self):
        # Multi-boutique : être propriétaire d'une AUTRE boutique ne suffit
        # pas, c'est le profil de la boutique active qui compte.
        autre = Boutique.objects.create(nom="Autre", slug="autre-credit-achat")
        Profil.objects.create(user=self.employe, boutique=autre, est_proprietaire=True)
        self.client.force_authenticate(user=self.employe)

        response = self._acheter(
            en_tetes={'HTTP_X_BOUTIQUE_ACTIVE': str(self.boutique.id)}, montant_paye="50"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self._assert_rien_cree()

    def test_credit_autorise_hors_premium(self):
        # D1, offre unique : un abonnement valide suffit, quel que soit le palier.
        self._abonnement(FormuleAbonnement.Palier.ESSENTIEL)

        response = self._acheter(montant_paye="50")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_credit_refuse_si_abonnement_expire(self):
        self._abonnement(FormuleAbonnement.Palier.PREMIUM, expire=True)

        response = self._acheter(montant_paye="50")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self._assert_rien_cree()

    def test_statut_et_montant_du_soumis_sont_ignores(self):
        response = self._acheter(montant_paye="50", statut_paiement='paye', montant_du="0")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        achat = Achat.objects.get(pk=response.data['id'])
        self.assertEqual(achat.statut_paiement, 'partiel')
        self.assertEqual(achat.montant_du, Decimal("130.00"))

    def test_vue_support_lit_la_dette(self):
        self._acheter(montant_paye="50")
        admin = User.objects.create_superuser(username="admin_support", password="pass1234")
        self.client.force_authenticate(user=admin)

        response = self.client.get(self.url_list, HTTP_X_SUPPORT_BOUTIQUE=str(self.boutique.id))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resultats = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(resultats), 1)
        self.assertEqual(resultats[0]['montant_du'], "130.00")

    def test_vue_support_ne_peut_pas_acheter_a_credit(self):
        admin = User.objects.create_superuser(username="admin_support", password="pass1234")
        self.client.force_authenticate(user=admin)

        response = self._acheter(
            en_tetes={'HTTP_X_SUPPORT_BOUTIQUE': str(self.boutique.id)}, montant_paye="50"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self._assert_rien_cree()


class AchatBackfillMontantPayeMigrationTests(TransactionTestCase):
    """D4 : 0016 remplit montant_paye = montant_total pour les achats
    existants (tous payés comptant avant ce champ), annulés compris. Le
    retour arrière doit marcher."""

    AVANT_BACKFILL = [('purchases', '0015_achat_paiement')]
    APRES_BACKFILL = [('purchases', '0016_backfill_achat_montant_paye')]
    AVANT_CHAMPS = [('purchases', '0014_alter_ligneachat_quantite')]

    def _migrer(self, cible):
        executor = MigrationExecutor(connection)
        executor.migrate(cible)
        return executor.loader.project_state(cible).apps

    def tearDown(self):
        # Toujours rendre un schéma à jour aux tests suivants.
        self._migrer(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_backfill_montant_paye_egal_montant_total(self):
        apps = self._migrer(self.AVANT_BACKFILL)
        Boutique = apps.get_model('tenants', 'Boutique')
        Achat = apps.get_model('purchases', 'Achat')
        boutique = Boutique.objects.create(nom="Boutique", slug="boutique-backfill-achat")
        valide = Achat.objects.create(boutique=boutique, montant_total=Decimal("400"))
        annule = Achat.objects.create(boutique=boutique, montant_total=Decimal("250"), statut='ANNULE')
        self.assertEqual(Achat.objects.filter(montant_paye__isnull=True).count(), 2)

        apps = self._migrer(self.APRES_BACKFILL)
        Achat = apps.get_model('purchases', 'Achat')

        self.assertEqual(Achat.objects.filter(montant_paye__isnull=True).count(), 0)
        valide = Achat.objects.get(pk=valide.pk)
        annule = Achat.objects.get(pk=annule.pk)
        self.assertEqual(valide.montant_paye, Decimal("400.00"))
        self.assertEqual(annule.montant_paye, Decimal("250.00"))
        for achat in (valide, annule):
            self.assertEqual(achat.statut_paiement, 'paye')
            self.assertEqual(achat.montant_du, Decimal("0.00"))
            self.assertIsNone(achat.mode_paiement)

    def test_retour_arriere_puis_reapplication(self):
        apps = self._migrer(self.AVANT_CHAMPS)
        Boutique = apps.get_model('tenants', 'Boutique')
        Achat = apps.get_model('purchases', 'Achat')
        boutique = Boutique.objects.create(nom="Boutique", slug="boutique-retour-achat")
        achat = Achat.objects.create(boutique=boutique, montant_total=Decimal("300"))

        apps = self._migrer(self.APRES_BACKFILL)
        apps = self._migrer(self.AVANT_CHAMPS)
        apps = self._migrer(self.APRES_BACKFILL)
        Achat = apps.get_model('purchases', 'Achat')

        self.assertEqual(Achat.objects.get(pk=achat.pk).montant_paye, Decimal("300.00"))


class AchatRebackfillMontantPayeMigrationTests(TransactionTestCase):
    """1 bis (contract) : 0018 refait le backfill des achats restés sans
    montant_paye (créés par l'ancien code pendant la fenêtre de
    déploiement du commit 1, tous comptant), sans toucher aux achats déjà
    renseignés, puis 0019 passe la colonne en NOT NULL."""

    AVANT = [('purchases', '0017_paiementfournisseur')]
    APRES = [('purchases', '0019_alter_achat_montant_paye_notnull')]

    def _migrer(self, cible):
        executor = MigrationExecutor(connection)
        executor.migrate(cible)
        return executor.loader.project_state(cible).apps

    def tearDown(self):
        # Toujours rendre un schéma à jour aux tests suivants.
        self._migrer(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_rebackfill_puis_not_null(self):
        apps = self._migrer(self.AVANT)
        Boutique = apps.get_model('tenants', 'Boutique')
        Achat = apps.get_model('purchases', 'Achat')
        boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rebackfill-achat")
        fenetre = Achat.objects.create(boutique=boutique, montant_total=Decimal("120"), montant_paye=None)
        credit = Achat.objects.create(
            boutique=boutique, montant_total=Decimal("300"), montant_paye=Decimal("50"),
            montant_du=Decimal("250"), statut_paiement='partiel',
        )
        self.assertEqual(Achat.objects.filter(montant_paye__isnull=True).count(), 1)

        apps = self._migrer(self.APRES)
        Achat = apps.get_model('purchases', 'Achat')

        self.assertEqual(Achat.objects.filter(montant_paye__isnull=True).count(), 0)
        self.assertEqual(Achat.objects.get(pk=fenetre.pk).montant_paye, Decimal("120.00"))
        credit = Achat.objects.get(pk=credit.pk)
        self.assertEqual(credit.montant_paye, Decimal("50.00"))
        self.assertEqual(credit.montant_du, Decimal("250.00"))
        self.assertEqual(credit.statut_paiement, 'partiel')
        self.assertFalse(Achat._meta.get_field('montant_paye').null)

    def test_retour_arriere_puis_reapplication(self):
        apps = self._migrer(self.APRES)
        Boutique = apps.get_model('tenants', 'Boutique')
        Achat = apps.get_model('purchases', 'Achat')
        boutique = Boutique.objects.create(nom="Boutique", slug="boutique-retour-rebackfill")
        achat = Achat.objects.create(boutique=boutique, montant_total=Decimal("80"), montant_paye=Decimal("30"))

        self._migrer(self.AVANT)
        apps = self._migrer(self.APRES)
        Achat = apps.get_model('purchases', 'Achat')

        self.assertEqual(Achat.objects.get(pk=achat.pk).montant_paye, Decimal("30.00"))


class PaiementFournisseurServiceTests(TestCase):
    """Dettes fournisseurs, commit 3 : paiements append-only, dette
    recalculée sous le verrou depuis l'acompte et les paiements."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-paiement-fournisseur")
        self.user = User.objects.create_user(username="proprio_dette", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        # 300 d'achat, 100 d'acompte : dette initiale 200.
        self.achat = self._achat_a_credit(montant_total="300", montant_paye="100")

    def _achat_a_credit(self, montant_total, montant_paye):
        montant_total, montant_paye = Decimal(montant_total), Decimal(montant_paye)
        return Achat.objects.create(
            boutique=self.boutique, fournisseur=self.fournisseur,
            montant_total=montant_total, montant_paye=montant_paye,
            montant_du=montant_total - montant_paye,
            statut_paiement='partiel' if montant_paye > 0 else 'en_attente',
        )

    def _payer(self, montant, achat=None, mode_paiement='ESPECES'):
        return enregistrer_paiement(
            achat or self.achat, Decimal(montant), self.user, mode_paiement=mode_paiement
        )

    def _corriger(self, paiement, nouveau_montant, motif="Erreur de saisie"):
        return corriger_paiement(paiement, Decimal(nouveau_montant), motif, self.user)

    def _assert_refuse(self, fonction, *args, nb_lignes_attendu=0, **kwargs):
        with self.assertRaises(ValidationError):
            fonction(*args, **kwargs)
        self.assertEqual(PaiementFournisseur.objects.count(), nb_lignes_attendu)

    def _recharger(self):
        self.achat.refresh_from_db()
        return self.achat

    # --- enregistrer_paiement ---

    def test_paiement_partiel(self):
        paiement = self._payer("50")

        self.assertEqual(PaiementFournisseur.objects.count(), 1)
        self.assertEqual(paiement.enregistre_par, self.user)
        self.assertEqual(paiement.mode_paiement, 'ESPECES')
        achat = self._recharger()
        self.assertEqual(achat.montant_du, Decimal("150.00"))
        self.assertEqual(achat.statut_paiement, 'partiel')

    def test_paiement_qui_solde_la_dette(self):
        self._payer("200")

        achat = self._recharger()
        self.assertEqual(achat.montant_du, Decimal("0.00"))
        self.assertEqual(achat.statut_paiement, 'paye')

    def test_paiement_superieur_au_du_refuse(self):
        self._assert_refuse(self._payer, "200.01")
        self.assertEqual(self._recharger().montant_du, Decimal("200.00"))

    def test_paiement_nul_ou_negatif_refuse(self):
        self._assert_refuse(self._payer, "0")
        self._assert_refuse(self._payer, "-10")

    def test_paiement_achat_annule_refuse(self):
        Achat.objects.filter(pk=self.achat.pk).update(statut='ANNULE')

        self._assert_refuse(self._payer, "50")

    def test_paiement_achat_comptant_refuse(self):
        comptant = Achat.objects.create(
            boutique=self.boutique, fournisseur=self.fournisseur,
            montant_total=Decimal("300"), montant_paye=Decimal("300"),
        )

        self._assert_refuse(self._payer, "50", achat=comptant)

    def test_mode_paiement_non_precise_accepte(self):
        paiement = self._payer("50", mode_paiement=None)

        self.assertIsNone(paiement.mode_paiement)

    # --- corriger_paiement ---

    def test_correction_append_only(self):
        paiement = self._payer("80")

        correction, achat, total = self._corriger(paiement, "50")

        self.assertEqual(PaiementFournisseur.objects.count(), 2)
        paiement.refresh_from_db()
        self.assertEqual(paiement.montant, Decimal("80.00"))
        self.assertIsNone(paiement.paiement_corrige)
        self.assertEqual(correction.paiement_corrige, paiement)
        self.assertEqual(correction.montant, Decimal("-30.00"))
        self.assertEqual(correction.motif_correction, "Erreur de saisie")
        self.assertEqual(total, Decimal("50.00"))
        self.assertEqual(achat.montant_du, Decimal("150.00"))
        self.assertEqual(self._recharger().montant_du, Decimal("150.00"))

    def test_correction_reprend_le_mode_de_loriginal(self):
        paiement = self._payer("80", mode_paiement='MOBILE_MONEY')

        correction, _, _ = self._corriger(paiement, "50")

        self.assertEqual(correction.mode_paiement, 'MOBILE_MONEY')

    def test_seconde_correction_sur_le_montant_effectif(self):
        paiement = self._payer("80")
        self._corriger(paiement, "50")

        correction, achat, _ = self._corriger(paiement, "60")

        self.assertEqual(correction.montant, Decimal("10.00"))
        self.assertEqual(correction.paiement_corrige, paiement)
        self.assertEqual(achat.montant_du, Decimal("140.00"))

    def test_correction_dune_correction_refusee(self):
        paiement = self._payer("80")
        correction, _, _ = self._corriger(paiement, "50")

        self._assert_refuse(self._corriger, correction, "40", nb_lignes_attendu=2)

    def test_correction_sans_motif_refusee(self):
        paiement = self._payer("80")

        self._assert_refuse(self._corriger, paiement, "50", motif="   ", nb_lignes_attendu=1)

    def test_correction_identique_refusee(self):
        paiement = self._payer("80")

        self._assert_refuse(self._corriger, paiement, "80", nb_lignes_attendu=1)

    def test_correction_nouveau_montant_negatif_refusee(self):
        paiement = self._payer("80")

        self._assert_refuse(self._corriger, paiement, "-1", nb_lignes_attendu=1)

    def test_correction_qui_depasse_la_dette_refusee(self):
        paiement = self._payer("80")
        self._payer("100")

        # Dette initiale 200 : 80 -> 101 ferait 201 de paiements.
        self._assert_refuse(self._corriger, paiement, "101", nb_lignes_attendu=2)
        self.assertEqual(self._recharger().montant_du, Decimal("20.00"))

    def test_correction_achat_annule_refusee(self):
        paiement = self._payer("80")
        Achat.objects.filter(pk=self.achat.pk).update(statut='ANNULE')

        self._assert_refuse(self._corriger, paiement, "50", nb_lignes_attendu=1)

    def test_correction_a_zero_sans_acompte_revient_en_attente(self):
        achat = self._achat_a_credit(montant_total="300", montant_paye="0")
        paiement = self._payer("300", achat=achat)
        achat.refresh_from_db()
        self.assertEqual(achat.statut_paiement, 'paye')

        _, achat, total = self._corriger(paiement, "0")

        self.assertEqual(total, Decimal("0"))
        self.assertEqual(achat.montant_du, Decimal("300.00"))
        self.assertEqual(achat.statut_paiement, 'en_attente')

    def test_correction_a_zero_avec_acompte_reste_partiel(self):
        paiement = self._payer("200")
        self.assertEqual(self._recharger().statut_paiement, 'paye')

        _, achat, _ = self._corriger(paiement, "0")

        self.assertEqual(achat.montant_du, Decimal("200.00"))
        self.assertEqual(achat.statut_paiement, 'partiel')

    def test_montant_du_egal_au_recalcul_depuis_les_lignes(self):
        p1 = self._payer("40")
        p2 = self._payer("70", mode_paiement='CARTE')
        self._corriger(p1, "25")
        self._payer("15")
        self._corriger(p2, "90")
        self._corriger(p1, "30")

        achat = self._recharger()
        self.assertEqual(PaiementFournisseur.objects.filter(achat=achat).count(), 6)
        total_lignes = PaiementFournisseur.objects.filter(achat=achat).aggregate(
            total=Sum('montant')
        )['total']
        # 30 + 90 + 15 = 135 versés après l'acompte.
        self.assertEqual(total_lignes, Decimal("135.00"))
        self.assertEqual(achat.montant_du, achat.montant_total - achat.montant_paye - total_lignes)
        self.assertEqual(achat.montant_du, Decimal("65.00"))
        self.assertEqual(achat.statut_paiement, 'partiel')


class PaiementFournisseurConcurrenceTests(TransactionTestCase):
    """Deux paiements concurrents sur la même dette, avec deux vraies
    connexions PostgreSQL. L'entrelacement est forcé : A s'arrête juste
    avant de créer sa ligne (verrou pris, vérifications faites), B démarre,
    et A n'est libéré qu'une fois B terminé ou bloqué sur un verrou. Avec
    select_for_update, B attend A puis voit la dette réduite et est
    refusé ; sans, B passe et la dette est payée deux fois."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-concurrence-dette")
        self.user = User.objects.create_user(username="proprio_concurrence_dette", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.achat = Achat.objects.create(
            boutique=self.boutique, fournisseur=fournisseur,
            montant_total=Decimal("150"), montant_paye=Decimal("0"),
            montant_du=Decimal("150"), statut_paiement='en_attente',
        )

    def _attente_sur_verrou(self, pid):
        with connection.cursor() as cursor:
            cursor.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", [pid])
            ligne = cursor.fetchone()
        return ligne is not None and ligne[0] == 'Lock'

    def test_deux_paiements_concurrents_ne_payent_pas_deux_fois(self):
        create_original = PaiementFournisseur.objects.create
        a_en_pause = threading.Event()
        liberer_a = threading.Event()
        pid_b = []
        resultats = {}
        verrou = threading.Lock()
        appels = []

        def create_avec_pause(**kwargs):
            with verrou:
                appels.append(kwargs['montant'])
                premier = len(appels) == 1
            if premier:
                a_en_pause.set()
                liberer_a.wait(timeout=10)
            return create_original(**kwargs)

        def payer(nom):
            try:
                if nom == 'b':
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_backend_pid()")
                        pid_b.append(cursor.fetchone()[0])
                enregistrer_paiement(self.achat, Decimal("100"), self.user)
                resultats[nom] = 'ok'
            except ValidationError as erreur:
                resultats[nom] = str(erreur.detail[0])
            except Exception as erreur:
                resultats[nom] = repr(erreur)
            finally:
                connection.close()

        with patch.object(PaiementFournisseur.objects, 'create', side_effect=create_avec_pause):
            thread_a = threading.Thread(target=payer, args=('a',))
            thread_a.start()
            self.assertTrue(a_en_pause.wait(timeout=10), resultats)

            thread_b = threading.Thread(target=payer, args=('b',))
            thread_b.start()
            limite = time.monotonic() + 10
            b_bloque = False
            while time.monotonic() < limite and thread_b.is_alive():
                if pid_b and self._attente_sur_verrou(pid_b[0]):
                    b_bloque = True
                    break
                time.sleep(0.01)

            liberer_a.set()
            thread_a.join(timeout=15)
            thread_b.join(timeout=15)

        self.assertTrue(b_bloque, f"B aurait dû attendre le verrou de A : {resultats}")
        self.assertEqual(resultats.get('a'), 'ok', resultats)
        self.assertIn("dépasse le montant dû", resultats.get('b', ''), resultats)
        self.assertEqual(PaiementFournisseur.objects.filter(achat=self.achat).count(), 1)
        self.achat.refresh_from_db()
        self.assertEqual(self.achat.montant_du, Decimal("50.00"))
        self.assertEqual(self.achat.statut_paiement, 'partiel')
