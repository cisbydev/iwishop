from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from products.models import Produit, UniteVente
from sales.models import Vente, LigneVente
from decimal import Decimal


class TableauDeBordAccesTests(APITestCase):
    """P2 point 14 : TableauDeBordView doit réutiliser la résolution de
    boutique effective et le contrôle d'accès de BoutiqueScopedMixin
    (Vue Support comprise) au lieu d'une logique ad-hoc dupliquée."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.user = User.objects.create_user(username="user_a", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.url = '/api/dashboard/kpis/'

    def test_acces_normal_autorise(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_boutique_desactivee_autorisee(self):
        """Vue en lecture seule : consulter son tableau de bord reste
        possible boutique désactivée - seules les écritures sont bloquées
        (scinde le contrôle lecture/écriture, audit complémentaire point 1)."""
        self.boutique.actif = False
        self.boutique.save()
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_abonnement_expire_autorise(self):
        """Vue en lecture seule : consulter son tableau de bord reste
        possible abonnement expiré - seules les écritures sont bloquées
        (scinde le contrôle lecture/écriture, audit complémentaire point 1)."""
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
        consulter le tableau de bord d'une autre boutique."""
        autre_boutique = Boutique.objects.create(nom="Boutique B", slug="boutique-b")
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, HTTP_X_SUPPORT_BOUTIQUE=str(autre_boutique.id))
        # L'en-tête est ignoré (non-superuser) : retombe sur sa propre boutique.
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class TableauDeBordRemiseBeneficeTests(APITestCase):
    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique remises", slug="boutique-remises-dashboard")
        self.user = User.objects.create_user(username="user_remises_dashboard", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit remisé",
            prix_achat=Decimal("900.00"), prix_unitaire=Decimal("1000.00"), prix_douzaine=Decimal("12000.00"),
            quantite_en_stock=100,
        )

    def _creer_vente(self, remise=Decimal("0.00"), statut="VALIDEE"):
        montant_total = Decimal("10000.00")
        montant_net = montant_total - remise
        vente = Vente.objects.create(
            boutique=self.boutique,
            montant_paye=montant_net,
            montant_total=montant_total,
            remise=remise,
            montant_net=montant_net,
            statut=statut,
        )
        LigneVente.objects.create(
            boutique=self.boutique, vente=vente, produit=self.produit, quantite=10,
            type_vente="UNITE", unite=self.unite, facteur_conversion_applique=Decimal("1.000"),
            prix_applique=Decimal("1000.00"), prix_achat_unitaire=Decimal("600.00"),
        )

    def test_kpis_utilisent_le_ca_net_et_excluent_les_ventes_annulees(self):
        self._creer_vente()
        self._creer_vente(remise=Decimal("1000.00"))
        self._creer_vente(remise=Decimal("1000.00"), statut="ANNULEE")

        response = self.client.get('/api/dashboard/kpis/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(response.data['chiffre_affaires_jour'])), Decimal("19000.00"))
        self.assertEqual(Decimal(str(response.data['chiffre_affaires_mois'])), Decimal("19000.00"))
        self.assertEqual(Decimal(str(response.data['benefice_jour'])), Decimal("7000.00"))
        self.assertEqual(Decimal(str(response.data['benefice_mois'])), Decimal("7000.00"))
