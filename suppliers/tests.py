from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from .models import Fournisseur


class FournisseurDestroyPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut supprimer un
    fournisseur ; la création/modification restent ouvertes à l'employé
    (non-régression)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-fournisseur")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur A")
        self.url_detail = reverse('fournisseurs-detail', args=[self.fournisseur.id])

    def test_employe_ne_peut_pas_supprimer(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Fournisseur.objects.filter(pk=self.fournisseur.id).exists())

    def test_employe_peut_toujours_creer_et_modifier(self):
        """Non-régression : création et modification restent ouvertes à l'employé."""
        self.client.force_authenticate(user=self.employe)
        response = self.client.post(reverse('fournisseurs-list'), {"nom": "Fournisseur B"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.patch(self.url_detail, {"telephone": "77000000"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_proprietaire_peut_supprimer(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Fournisseur.objects.filter(pk=self.fournisseur.id).exists())


class FournisseurEcritureAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 bis : PATCH/DELETE sur Fournisseur
    n'étaient protégés qu'implicitement par get_queryset() (via
    get_object()) ; ils doivent maintenant appeler _verifier_acces()
    eux-mêmes (perform_update/perform_destroy du mixin) - sans quoi le
    contrôle scindé lecture/écriture réintroduirait la faille déjà fermée
    (audit complémentaire point 1). La lecture (GET), elle, reste permise."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-ecriture-fournisseur")
        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.proprietaire)

        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur A")

        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

    def test_lecture_autorisee_si_abonnement_expire(self):
        response = self.client.get(reverse('fournisseurs-detail', args=[self.fournisseur.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_refuse_si_abonnement_expire(self):
        response = self.client.patch(
            reverse('fournisseurs-detail', args=[self.fournisseur.id]), {"nom": "Tentative"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.fournisseur.refresh_from_db()
        self.assertEqual(self.fournisseur.nom, "Fournisseur A")

    def test_delete_refuse_si_abonnement_expire(self):
        response = self.client.delete(reverse('fournisseurs-detail', args=[self.fournisseur.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Fournisseur.objects.filter(pk=self.fournisseur.id).exists())
