from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from suppliers.models import Fournisseur
from products.models import Produit, UniteVente, ProduitPrix
from inventory.models import MouvementStock
from sales.models import LigneVente
from .models import Achat, LigneAchat


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
        achat = Achat.objects.create(boutique=self.boutique_b, fournisseur=self.fournisseur_b)
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
        achat = Achat.objects.create(boutique=self.boutique, fournisseur=self.fournisseur)
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
                boutique=self.boutique, fournisseur=self.fournisseur, utilisateur=self.user,
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
