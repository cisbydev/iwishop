import threading
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase, APITransactionTestCase, APIClient

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from products.models import Produit, UniteVente, ProduitPrix
from inventory.models import MouvementStock
from .models import Vente, LigneVente


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


class VenteAnnulationPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut annuler une vente ; un
    employé peut créer une vente (opération quotidienne) mais pas l'annuler."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-vente")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=20,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))

        # Non-régression : un employé peut créer une vente (opération quotidienne).
        self.client.force_authenticate(user=self.employe)
        payload = {
            "montant_paye": "500.00",
            "lignes": [{"produit": self.produit.id, "quantite": 5, "type_vente": "UNITE", "prix_applique": "100.00"}],
        }
        response = self.client.post(reverse('ventes-list'), payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        self.vente_id = response.data['id']
        self.vente = Vente.objects.get(pk=self.vente_id)

        self.produit.refresh_from_db()
        assert self.produit.quantite_en_stock == 15  # 20 - 5

        self.url_annuler = reverse('ventes-annuler', args=[self.vente_id])

    def test_employe_ne_peut_pas_annuler(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.vente.refresh_from_db()
        self.assertEqual(self.vente.statut, 'VALIDEE')
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 15)  # inchangé

    def test_proprietaire_peut_annuler(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.vente.refresh_from_db()
        self.assertEqual(self.vente.statut, 'ANNULEE')
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 20)  # restauré


class VenteConcurrenceStockTests(APITransactionTestCase):
    """P1 point 7 : deux ventes simultanées sur le même produit ne
    doivent jamais pouvoir survendre le stock réellement disponible
    (race condition sur Produit.quantite_en_stock).

    APITransactionTestCase (et non APITestCase) est indispensable ici :
    APITestCase enveloppe chaque test dans UNE transaction non committée,
    donc un deuxième thread avec sa propre connexion ne verrait même pas
    les données créées dans setUp(). APITransactionTestCase committe
    réellement les données et vide les tables entre les tests, ce qui
    permet à deux threads d'ouvrir deux vraies transactions concurrentes
    - condition nécessaire pour que select_for_update() ait un sens à
    tester."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-concurrence-vente")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Sac Riw",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=5,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))
        self.url = reverse('ventes-list')

    def _vendre(self, quantite, resultats, cle):
        # Chaque thread a besoin de sa propre connexion DB (thread-locale
        # dans Django) et de son propre client - self.client ne doit pas
        # être partagé entre threads.
        client = APIClient()
        client.force_authenticate(user=self.user)
        payload = {
            "montant_paye": str(Decimal(quantite) * Decimal("100.00")),
            "lignes": [{
                "produit": self.produit.id, "quantite": quantite,
                "type_vente": "UNITE", "prix_applique": "100.00",
            }],
        }
        try:
            resultats[cle] = client.post(self.url, payload, format='json')
        finally:
            connection.close()

    def test_deux_ventes_simultanees_ne_survendent_pas(self):
        # Stock = 5. Deux ventes de 4 et 3 unités en simultané : 4+3=7 > 5,
        # une seule doit passer.
        resultats = {}
        t1 = threading.Thread(target=self._vendre, args=(4, resultats, 'a'))
        t2 = threading.Thread(target=self._vendre, args=(3, resultats, 'b'))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        codes = {resultats['a'].status_code, resultats['b'].status_code}
        self.assertEqual(
            codes, {status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST},
            f"Attendu une vente acceptée et une refusée, obtenu : "
            f"a={resultats['a'].status_code} ({resultats['a'].data}), "
            f"b={resultats['b'].status_code} ({resultats['b'].data})"
        )

        quantite_gagnante = 4 if resultats['a'].status_code == status.HTTP_201_CREATED else 3
        self.produit.refresh_from_db()
        # Le stock final doit refléter EXACTEMENT la vente qui est passée,
        # jamais une valeur "perdue" (lost update) ni un stock négatif.
        self.assertEqual(self.produit.quantite_en_stock, 5 - quantite_gagnante)


class VenteAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir créer de vente. VenteViewSet.perform_create()
    est surchargé (pour laisser VenteSerializer.create() résoudre lui-même
    la boutique) et ne passait donc jamais par le contrôle d'accès du
    mixin - la vérification `boutique.actif` du serializer ne couvrait pas
    l'abonnement expiré."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-vente")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=20,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))

        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('ventes-list')
        self.payload = {
            "montant_paye": "500.00",
            "lignes": [{"produit": self.produit.id, "quantite": 5, "type_vente": "UNITE", "prix_applique": "100.00"}],
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
        self.assertEqual(Vente.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 20)

    def test_creation_autorisee_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout (fallback
        historique, ex. boutiques créées avant Point 8) doit continuer à
        vendre normalement."""
        response = self.client.post(self.url_list, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 15)


class VenteQuantiteInvalideTests(APITestCase):
    """Audit complémentaire point 2 : une quantité négative sur une ligne de
    vente inversait le sens de l'opération - au lieu de retirer du stock,
    la vente en ajoutait (démontré : quantite=-5 sur un stock de 10 le
    faisait passer à 15). Une quantité nulle n'a pas de sens non plus."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-quantite-invalide-vente")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))

        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('ventes-list')

    def _tenter_vente(self, quantite):
        return self.client.post(self.url_list, {
            "montant_paye": "500.00",
            "lignes": [{"produit": self.produit.id, "quantite": quantite, "type_vente": "UNITE", "prix_applique": "100.00"}],
        }, format='json')

    def test_quantite_negative_refusee_stock_inchange(self):
        """Reproduit exactement la faille démontrée : quantite=-5 ne doit
        plus augmenter le stock au lieu de le diminuer."""
        response = self._tenter_vente(-5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vente.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_quantite_nulle_refusee(self):
        response = self._tenter_vente(0)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vente.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_quantite_positive_toujours_autorisee(self):
        """Non-régression : une vente normale reste possible."""
        response = self._tenter_vente(5)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 5)


class VenteMontantInvalideTests(APITestCase):
    """Audit point 3 : une remise négative, une remise dépassant le montant
    total, ou un montant payé négatif faussaient les écritures financières
    d'une vente. Contournement démontré : remise=200 sur un montant_total=100
    combiné à un montant_paye négatif faisait ressortir une "monnaie rendue"
    positive sur une vente au montant net négatif (le client repartait avec
    de l'argent en ayant "payé" un montant négatif)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-montant-invalide-vente")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=10,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("100"))

        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('ventes-list')

    def _tenter_vente(self, *, remise=None, montant_paye):
        payload = {
            "montant_paye": str(montant_paye),
            "lignes": [{"produit": self.produit.id, "quantite": 1, "type_vente": "UNITE", "prix_applique": "100.00"}],
        }
        if remise is not None:
            payload["remise"] = str(remise)
        return self.client.post(self.url_list, payload, format='json')

    def test_contournement_remise_excessive_et_montant_paye_negatif_refuse(self):
        """Reproduit exactement le scénario de contournement démontré :
        montant_total=100 (1 ligne à 100), remise=200, montant_paye=-50."""
        response = self._tenter_vente(remise="200.00", montant_paye="-50.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vente.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_remise_superieure_au_montant_total_refusee_meme_avec_montant_paye_valide(self):
        """Même avec un montant_paye valide (>= 0), une remise supérieure
        au montant total (200 sur 100) doit être refusée : elle rendrait le
        montant net négatif."""
        response = self._tenter_vente(remise="200.00", montant_paye="0.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vente.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_remise_negative_refusee(self):
        response = self._tenter_vente(remise="-10.00", montant_paye="100.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vente.objects.count(), 0)

    def test_montant_paye_negatif_refuse(self):
        response = self._tenter_vente(montant_paye="-10.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vente.objects.count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 10)

    def test_remise_normale_toujours_autorisee(self):
        """Non-régression : une remise raisonnable (inférieure au total)
        reste acceptée."""
        response = self._tenter_vente(remise="10.00", montant_paye="90.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        vente = Vente.objects.get(pk=response.data['id'])
        self.assertEqual(vente.montant_total, Decimal("100.00"))
        self.assertEqual(vente.remise, Decimal("10.00"))
        self.assertEqual(vente.montant_net, Decimal("90.00"))

    def test_remise_egale_au_montant_total_autorisee(self):
        """Non-régression : une remise à 100% du total (montant net à zéro)
        reste un cas légitime (article offert)."""
        response = self._tenter_vente(remise="100.00", montant_paye="0.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        vente = Vente.objects.get(pk=response.data['id'])
        self.assertEqual(vente.montant_net, Decimal("0.00"))

    def test_vente_sans_remise_toujours_autorisee(self):
        """Non-régression : une vente normale sans remise reste possible."""
        response = self._tenter_vente(montant_paye="100.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class VenteListQueryCountTests(APITestCase):
    """Audit point 13 : utilisateur_nom, et surtout les lignes imbriquées
    (produit_nom/unite_nom par ligne), faisaient plusieurs requêtes par
    vente listée sans select_related/prefetch_related. Le nombre de
    requêtes doit rester constant, pas proportionnel au nombre de ventes
    ni de lignes."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-n1-ventes")
        self.user = User.objects.create_user(username="user_n1_ventes", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000")
        )
        self.client.force_authenticate(user=self.user)
        self.url_list = reverse('ventes-list')

    def _creer_ventes(self, n, lignes_par_vente=2):
        for i in range(n):
            vente = Vente.objects.create(
                boutique=self.boutique, utilisateur=self.user, montant_paye=Decimal("100"),
            )
            for j in range(lignes_par_vente):
                produit = Produit.objects.create(
                    boutique=self.boutique, nom=f"Produit {i}-{j}",
                    prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
                )
                LigneVente.objects.create(
                    boutique=self.boutique, vente=vente, produit=produit, quantite=1,
                    type_vente='UNITE', unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
                    prix_applique=Decimal("100"),
                )

    def test_nombre_de_requetes_constant_quel_que_soit_le_nombre_de_ventes(self):
        # Réauthentifie avec une instance User fraîche avant CHAQUE appel :
        # self.user (construit dans setUp) a son .profil.boutique mis en
        # cache gratuitement dès la construction, ce qu'une vraie requête
        # HTTP n'a jamais - sans ce rafraîchissement systématique, seul le
        # premier appel refléterait ce coût réel.
        self._creer_ventes(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            response_1 = self.client.get(self.url_list)

        self._creer_ventes(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response_2 = self.client.get(self.url_list)

        self.assertEqual(response_1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_2.data['results']), 7)
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))
