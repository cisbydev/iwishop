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
