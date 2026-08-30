from decimal import Decimal
from datetime import date

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from .models import Depense


class DepenseModificationPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seule la modification/suppression d'une dépense
    est réservée au propriétaire ; la création reste ouverte à l'employé
    (non-régression - il doit pouvoir déclarer une dépense quotidienne)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-depense")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.depense = Depense.objects.create(
            boutique=self.boutique, titre="Loyer août", categorie="LOYER",
            montant=Decimal("50000.00"), date_depense=date(2026, 8, 1),
        )
        self.url_detail = reverse('depenses-detail', args=[self.depense.id])

    def test_employe_peut_creer(self):
        """Non-régression : la création reste ouverte à l'employé."""
        self.client.force_authenticate(user=self.employe)
        payload = {
            "titre": "Transport", "categorie": "TRANSPORT",
            "montant": "2000.00", "date_depense": "2026-08-30",
        }
        response = self.client.post(reverse('depenses-list'), payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_employe_ne_peut_pas_modifier(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.patch(self.url_detail, {"montant": "1.00"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.depense.refresh_from_db()
        self.assertEqual(str(self.depense.montant), "50000.00")

    def test_employe_ne_peut_pas_supprimer(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Depense.objects.filter(pk=self.depense.id).exists())

    def test_proprietaire_peut_modifier_et_supprimer(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.patch(self.url_detail, {"montant": "55000.00"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.delete(self.url_detail)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Depense.objects.filter(pk=self.depense.id).exists())
