from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from products.models import Produit, UniteVente, ProduitPrix
from inventory.models import MouvementStock
from .models import Vente


class VenteAnnulationTests(APITestCase):
    """P0 n°3 : une vente validée ne se modifie ni ne se supprime ; elle
    s'annule via une écriture inverse qui restaure le stock exactement."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b")

        self.user_a = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.unite_a = UniteVente.objects.create(
            boutique=self.boutique_a, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit_a = Produit.objects.create(
            boutique=self.boutique_a, nom="Produit A",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=20,
        )
        ProduitPrix.objects.create(produit=self.produit_a, unite=self.unite_a, prix=Decimal("100"))

        self.client.force_authenticate(user=self.user_a)
        self.url_list = reverse('ventes-list')

        # Vente réelle via l'API (5 unités à 100 = 500), comme le ferait le frontend.
        payload = {
            "montant_paye": "500.00",
            "lignes": [{"produit": self.produit_a.id, "quantite": 5, "type_vente": "UNITE", "prix_applique": "100.00"}],
        }
        response = self.client.post(self.url_list, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        self.vente_id = response.data['id']
        self.vente = Vente.objects.get(pk=self.vente_id)

        self.produit_a.refresh_from_db()
        assert self.produit_a.quantite_en_stock == 15  # 20 - 5

        self.url_detail = reverse('ventes-detail', args=[self.vente_id])
        self.url_annuler = reverse('ventes-annuler', args=[self.vente_id])

    # --- 1. PUT/PATCH/DELETE bloqués ---

    def test_put_refuse(self):
        response = self.client.put(self.url_detail, {"montant_paye": "1.00"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_patch_refuse(self):
        response = self.client.patch(self.url_detail, {"montant_paye": "1.00"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.vente.refresh_from_db()
        self.assertEqual(self.vente.montant_paye, Decimal("500.00"))

    def test_delete_refuse(self):
        response = self.client.delete(self.url_detail)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Vente.objects.filter(pk=self.vente_id).exists())

    # --- 2. Annulation : stock restauré ligne par ligne, mouvement créé ---

    def test_annulation_restaure_stock_et_cree_mouvement(self):
        nb_mouvements_avant = MouvementStock.objects.count()

        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.vente.refresh_from_db()
        self.assertEqual(self.vente.statut, 'ANNULEE')

        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, 20)  # restauré exactement

        self.assertEqual(MouvementStock.objects.count(), nb_mouvements_avant + 1)
        mouvement = MouvementStock.objects.latest('id')
        self.assertEqual(mouvement.produit_id, self.produit_a.id)
        self.assertEqual(mouvement.type_mouvement, 'ENTREE')
        self.assertEqual(mouvement.quantite, 5)
        self.assertEqual(mouvement.motif, f"Annulation Vente #{self.vente.numero}")

    # --- 3. Idempotence : un second appel est refusé, pas de double restauration ---

    def test_double_annulation_refusee_sans_double_restauration(self):
        self.client.post(self.url_annuler)
        self.produit_a.refresh_from_db()
        stock_apres_premiere_annulation = self.produit_a.quantite_en_stock
        nb_mouvements_apres_premiere = MouvementStock.objects.count()

        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, stock_apres_premiere_annulation)
        self.assertEqual(MouvementStock.objects.count(), nb_mouvements_apres_premiere)

    # --- 4. dashboard/reports avant/après annulation ---

    def test_dashboard_et_rapports_excluent_vente_annulee(self):
        url_kpis = reverse('tableau-de-bord-kpis')
        url_resume = reverse('resume-financier')

        avant_kpis = self.client.get(url_kpis).data
        avant_resume = self.client.get(url_resume).data
        self.assertEqual(Decimal(str(avant_kpis['chiffre_affaires_jour'])), Decimal("500.00"))
        self.assertEqual(Decimal(str(avant_resume['chiffre_affaires'])), Decimal("500.00"))

        self.client.post(self.url_annuler)

        apres_kpis = self.client.get(url_kpis).data
        apres_resume = self.client.get(url_resume).data
        self.assertEqual(Decimal(str(apres_kpis['chiffre_affaires_jour'])), Decimal("0.00"))
        self.assertEqual(apres_kpis['nombre_ventes_jour'], 0)
        self.assertEqual(Decimal(str(apres_resume['chiffre_affaires'])), Decimal("0.00"))
        self.assertEqual(apres_resume['nombre_ventes'], 0)

    # --- 6. Isolation multi-tenant sur l'annulation ---

    def test_annulation_par_autre_boutique_refusee(self):
        self.client.force_authenticate(user=self.user_b)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.vente.refresh_from_db()
        self.assertEqual(self.vente.statut, 'VALIDEE')
        self.produit_a.refresh_from_db()
        self.assertEqual(self.produit_a.quantite_en_stock, 15)
