from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
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

    def test_boutique_desactivee_refusee(self):
        self.boutique.actif = False
        self.boutique.save()
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_abonnement_expire_refuse(self):
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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
