from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Abonnement, Boutique, DemandeAcces, FormuleAbonnement


class EssaiGratuitApprouverDemandeTests(TestCase):
    """Point 8 de l'audit : une boutique créée via le flux client normal
    (DemandeAcces -> ApprouverDemandeView) doit démarrer avec un essai
    gratuit de 14 jours, pas un accès illimité."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_plateforme', email='admin@example.com', password='x'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.demande = DemandeAcces.objects.create(
            nom_contact='Awa Diop',
            email='awa@example.com',
            nom_boutique_souhaite='Boutique Awa',
        )

    def test_approbation_cree_un_abonnement_essai_14_jours(self):
        aujourdhui = timezone.localdate()
        response = self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')

        self.assertEqual(response.status_code, 201)

        boutique = Boutique.objects.get(nom='Boutique Awa')
        abonnement = Abonnement.objects.get(boutique=boutique)

        self.assertEqual(abonnement.formule.nom, 'Essai gratuit')
        self.assertEqual(abonnement.statut, 'ACTIF')
        self.assertEqual(abonnement.date_debut, aujourdhui)
        self.assertEqual(abonnement.date_fin, aujourdhui + timezone.timedelta(days=14))
        self.assertEqual(abonnement.reference_paiement, 'ESSAI_GRATUIT')

    def test_boutique_accessible_pendant_essai(self):
        self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')
        boutique = Boutique.objects.get(nom='Boutique Awa')

        self.assertTrue(boutique.abonnement_valide())
        self.assertTrue(boutique.est_accessible())

    def test_boutique_bloquee_apres_expiration_essai(self):
        self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')
        boutique = Boutique.objects.get(nom='Boutique Awa')

        abonnement = boutique.abonnement
        abonnement.date_fin = timezone.localdate() - timezone.timedelta(days=1)
        abonnement.save()

        self.assertFalse(boutique.abonnement_valide())
        self.assertFalse(boutique.est_accessible())

    def test_formule_essai_non_listee_publiquement(self):
        """La formule interne d'essai ne doit jamais apparaître dans le
        catalogue de formules proposées au client (elle n'est pas
        sélectionnable manuellement)."""
        self.client.post(f'/api/tenants/demandes/{self.demande.id}/approuver/')

        formule_essai = FormuleAbonnement.objects.get(nom='Essai gratuit')
        self.assertFalse(formule_essai.actif)


class ExemptionCreationAdminTests(TestCase):
    """Garde-fou de non-régression : une boutique créée directement (comme
    depuis l'admin Django, hors DemandeAcces) ne doit PAS recevoir d'essai
    automatique - elle reste sur le fallback historique
    (pas d'abonnement = accès autorisé), comme convenu."""

    def test_boutique_creee_directement_reste_exemptee(self):
        boutique = Boutique.objects.create(nom='Boutique Test Admin', slug='boutique-test-admin')

        self.assertFalse(hasattr(boutique, 'abonnement'))
        self.assertTrue(boutique.abonnement_valide())
        self.assertTrue(boutique.est_accessible())
