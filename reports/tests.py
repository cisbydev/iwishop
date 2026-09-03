from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from suppliers.models import Fournisseur
from products.models import Produit, UniteVente, ProduitPrix
from sales.models import Vente, LigneVente


class ResumeFinancierAccesTests(APITestCase):
    """P2 point 14 : ResumeFinancierView doit réutiliser la résolution de
    boutique effective et le contrôle d'accès de BoutiqueScopedMixin
    (Vue Support comprise) au lieu d'une logique ad-hoc dupliquée."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.user = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.url = '/api/reports/resume-financier/'

    def test_acces_normal_autorise(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_boutique_desactivee_autorisee(self):
        """Vue en lecture seule : consulter ses rapports reste possible
        boutique désactivée - seules les écritures sont bloquées (scinde
        le contrôle lecture/écriture, audit complémentaire point 1)."""
        self.boutique.actif = False
        self.boutique.save()
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_abonnement_expire_autorise(self):
        """Vue en lecture seule : consulter ses rapports reste possible
        abonnement expiré - seules les écritures sont bloquées (scinde
        le contrôle lecture/écriture, audit complémentaire point 1)."""
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_vue_support_superuser_autorisee(self):
        admin = User.objects.create_superuser(username="admin", email="admin@example.com", password="x")
        self.client.force_authenticate(user=admin)
        response = self.client.get(self.url, HTTP_X_SUPPORT_BOUTIQUE=str(self.boutique.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_vue_support_boutique_introuvable_403_pas_500(self):
        """Avant la correction, un ID de Vue Support inexistant faisait
        planter la vue (Boutique.DoesNotExist non gérée -> 500)."""
        admin = User.objects.create_superuser(username="admin2", email="admin2@example.com", password="x")
        self.client.force_authenticate(user=admin)
        response = self.client.get(self.url, HTTP_X_SUPPORT_BOUTIQUE='999999')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_vue_support_ignoree_pour_non_superuser(self):
        """Un employé ne peut pas utiliser l'en-tête Vue Support pour
        consulter le résumé financier d'une autre boutique."""
        autre_boutique = Boutique.objects.create(nom="Boutique B", slug="boutique-b")
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, HTTP_X_SUPPORT_BOUTIQUE=str(autre_boutique.id))
        # L'en-tête est ignoré (non-superuser) : retombe sur sa propre boutique.
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ResumeFinancierBeneficeNegatifTests(APITestCase):
    """Audit point 3 : les nouveaux validateurs >= 0 sur les prix
    n'empêchent pas un bénéfice CALCULÉ négatif, qui reste légitime quand
    prix_achat > prix de vente (erreur de tarification, vente à perte
    assumée...). Seule la SAISIE d'un prix négatif est bloquée, pas le
    résultat d'un calcul (voir products.tests.ProduitPrixNegatifTests)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-benefice-negatif")
        self.user = User.objects.create_user(username="user", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        # Prix d'achat volontairement supérieur au prix de vente.
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit vendu à perte",
            prix_achat=Decimal("100.00"), prix_unitaire=Decimal("60.00"), prix_douzaine=Decimal("700.00"),
            quantite_en_stock=10,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("60.00"))

        vente = Vente.objects.create(
            boutique=self.boutique, montant_paye=Decimal("60.00"),
            montant_total=Decimal("60.00"), montant_net=Decimal("60.00"),
        )
        LigneVente.objects.create(
            boutique=self.boutique, vente=vente, produit=self.produit, quantite=1,
            type_vente='UNITE', unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
            prix_applique=Decimal("60.00"),
        )

    def test_benefice_calcule_negatif_reste_autorise(self):
        response = self.client.get('/api/reports/resume-financier/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        benefice_brut = Decimal(str(response.data['benefice_brut']))
        self.assertEqual(benefice_brut, Decimal("-40.00"))


class CoutHistoriqueBeneficeTests(APITestCase):
    """BUG P1 : Produit.prix_achat change à chaque nouvel achat (dernier
    prix payé au fournisseur - voir purchases.serializers.AchatSerializer),
    et ne doit plus jamais être relu pour recalculer le bénéfice d'une vente
    déjà réalisée. Le bénéfice historique doit utiliser
    LigneVente.prix_achat_unitaire, figé au moment de chaque vente.

    Lien avec la limite déjà connue (audit Point 4 - Achats) : annuler un
    achat restaure le stock mais pas Produit.prix_achat (pas d'historique de
    prix côté achats). Ce chantier ne corrige pas cette limite - il l'évite
    simplement côté ventes en ne dépendant plus jamais de la valeur courante
    de Produit.prix_achat pour un bénéfice déjà calculé. Les deux limites
    restent indépendantes : celle des achats concerne l'ANNULATION d'un
    achat, celle-ci concernait la LECTURE d'un coût par les rapports."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-cout-historique-rapports")
        self.user = User.objects.create_user(username="user_cout_rapports", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("500.00"), prix_unitaire=Decimal("800.00"), prix_douzaine=Decimal("9600.00"),
            quantite_en_stock=100,
        )
        ProduitPrix.objects.create(produit=self.produit, unite=self.unite, prix=Decimal("800.00"))
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")

    def _vendre(self, quantite):
        response = self.client.post(reverse('ventes-list'), {
            "montant_paye": str(Decimal("800.00") * quantite),
            "lignes": [{"produit": self.produit.id, "quantite": quantite, "type_vente": "UNITE", "prix_applique": "800.00"}],
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def _acheter(self, prix_unitaire_achat):
        response = self.client.post(reverse('achats-list'), {
            "fournisseur": self.fournisseur.id,
            "lignes": [{"produit": self.produit.id, "quantite": 1, "unite": self.unite.id, "prix_unitaire_achat": str(prix_unitaire_achat)}],
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def _benefice_brut(self):
        response = self.client.get('/api/reports/resume-financier/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return Decimal(str(response.data['benefice_brut']))

    def test_1_benefice_historique_inchange_apres_nouvel_achat(self):
        self._vendre(10)
        self.assertEqual(self._benefice_brut(), Decimal("3000.00"))  # 10 x (800-500)

        self._acheter(Decimal("700.00"))
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("700.00"))

        # Doit rester 3000, pas retomber à 1000 (10 x (800-700)).
        self.assertEqual(self._benefice_brut(), Decimal("3000.00"))

    def test_2_deux_ventes_deux_couts_distincts(self):
        self._vendre(10)                    # coût 500 -> bénéfice 3000
        self._acheter(Decimal("700.00"))
        self._vendre(10)                    # coût 700 -> bénéfice 1000

        lignes = LigneVente.objects.filter(boutique=self.boutique).order_by('id')
        self.assertEqual(lignes.count(), 2)
        self.assertEqual(lignes[0].prix_achat_unitaire, Decimal("500.00"))
        self.assertEqual(lignes[1].prix_achat_unitaire, Decimal("700.00"))
        self.assertEqual(self._benefice_brut(), Decimal("4000.00"))

    def test_3_changement_ulterieur_du_produit_sans_impact_retroactif(self):
        self._vendre(10)
        self._acheter(Decimal("700.00"))
        self._vendre(10)
        self.assertEqual(self._benefice_brut(), Decimal("4000.00"))

        self._acheter(Decimal("900.00"))
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.prix_achat, Decimal("900.00"))
        self.assertEqual(self._benefice_brut(), Decimal("4000.00"))  # toujours 4000

    def test_lignes_pre_migration_sans_cout_historique_retombent_sur_produit(self):
        """Repli documenté (Coalesce) pour les lignes antérieures à ce
        correctif : prix_achat_unitaire NULL -> Produit.prix_achat courant,
        comme avant. Comportement inchangé pour les données existantes,
        jamais utilisé pour une ligne créée après ce correctif."""
        vente = Vente.objects.create(
            boutique=self.boutique, montant_paye=Decimal("800.00"),
            montant_total=Decimal("800.00"), montant_net=Decimal("800.00"),
        )
        LigneVente.objects.create(
            boutique=self.boutique, vente=vente, produit=self.produit, quantite=1,
            type_vente='UNITE', unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
            prix_applique=Decimal("800.00"),
            # prix_achat_unitaire omis : simule une ligne créée avant le correctif.
        )
        self.assertEqual(self._benefice_brut(), Decimal("300.00"))  # 800 - 500 (prix_achat courant)
