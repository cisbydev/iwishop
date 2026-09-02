from decimal import Decimal
from datetime import date

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Boutique, Profil
from .models import Depense


class DepenseImmutabiliteTests(APITestCase):
    """P2 point 15 : une dépense validée est une écriture comptable - elle
    ne se modifie ni ne se supprime, elle s'annule (même principe que
    Vente/Achat, P0)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-depense")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.depense = Depense.objects.create(
            boutique=self.boutique, titre="Loyer août", categorie="LOYER",
            montant=Decimal("50000.00"), date_depense=date(2026, 8, 1),
        )
        self.url_detail = reverse('depenses-detail', args=[self.depense.id])
        self.url_annuler = reverse('depenses-annuler', args=[self.depense.id])

    def test_employe_peut_creer(self):
        """Non-régression : la création reste ouverte à l'employé."""
        self.client.force_authenticate(user=self.employe)
        payload = {
            "titre": "Transport", "categorie": "TRANSPORT",
            "montant": "2000.00", "date_depense": "2026-08-30",
        }
        response = self.client.post(reverse('depenses-list'), payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['statut'], 'VALIDEE')

    def test_put_refuse_meme_pour_le_proprietaire(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.put(self.url_detail, {"montant": "1.00"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.depense.refresh_from_db()
        self.assertEqual(str(self.depense.montant), "50000.00")

    def test_patch_refuse_meme_pour_le_proprietaire(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.patch(self.url_detail, {"montant": "1.00"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.depense.refresh_from_db()
        self.assertEqual(str(self.depense.montant), "50000.00")

    def test_delete_refuse_meme_pour_le_proprietaire(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Depense.objects.filter(pk=self.depense.id).exists())

    def test_statut_non_modifiable_a_la_creation(self):
        """`statut` est en lecture seule : impossible de créer directement
        une dépense déjà ANNULEE."""
        self.client.force_authenticate(user=self.employe)
        payload = {
            "titre": "Test", "categorie": "AUTRE",
            "montant": "100.00", "date_depense": "2026-08-30", "statut": "ANNULEE",
        }
        response = self.client.post(reverse('depenses-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['statut'], 'VALIDEE')


class DepenseAnnulationTests(APITestCase):
    """P2 point 15 : annulation d'une dépense - RBAC, idempotence,
    isolation cross-boutique, exclusion des rapports financiers."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a-depense")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b-depense")

        self.proprietaire_a = User.objects.create_user(username="proprio_a", password="pass1234")
        Profil.objects.create(user=self.proprietaire_a, boutique=self.boutique_a, est_proprietaire=True)

        self.employe_a = User.objects.create_user(username="employe_a", password="pass1234")
        Profil.objects.create(user=self.employe_a, boutique=self.boutique_a, est_proprietaire=False)

        self.proprietaire_b = User.objects.create_user(username="proprio_b", password="pass1234")
        Profil.objects.create(user=self.proprietaire_b, boutique=self.boutique_b, est_proprietaire=True)

        self.depense = Depense.objects.create(
            boutique=self.boutique_a, titre="Loyer août", categorie="LOYER",
            montant=Decimal("50000.00"), date_depense=date(2026, 8, 1),
        )
        self.url_annuler = reverse('depenses-annuler', args=[self.depense.id])

    def test_employe_ne_peut_pas_annuler(self):
        self.client.force_authenticate(user=self.employe_a)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.depense.refresh_from_db()
        self.assertEqual(self.depense.statut, 'VALIDEE')

    def test_proprietaire_peut_annuler(self):
        self.client.force_authenticate(user=self.proprietaire_a)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.depense.refresh_from_db()
        self.assertEqual(self.depense.statut, 'ANNULEE')

    def test_double_annulation_refusee(self):
        self.client.force_authenticate(user=self.proprietaire_a)
        self.client.post(self.url_annuler)

        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_annulation_par_autre_boutique_refusee(self):
        self.client.force_authenticate(user=self.proprietaire_b)
        response = self.client.post(self.url_annuler)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.depense.refresh_from_db()
        self.assertEqual(self.depense.statut, 'VALIDEE')

    def test_rapport_financier_exclut_depense_annulee(self):
        url_resume = reverse('resume-financier')
        self.client.force_authenticate(user=self.proprietaire_a)

        avant = self.client.get(url_resume).data
        self.assertEqual(Decimal(str(avant['total_depenses'])), Decimal("50000.00"))
        self.assertEqual(avant['nombre_depenses'], 1)

        self.client.post(self.url_annuler)

        apres = self.client.get(url_resume).data
        self.assertEqual(Decimal(str(apres['total_depenses'])), Decimal("0.00"))
        self.assertEqual(apres['nombre_depenses'], 0)


class DepenseTracabiliteTests(APITestCase):
    """P2 point 16 : une dépense doit enregistrer l'employé qui l'a
    déclarée, comme Vente.utilisateur."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-tracabilite-depense")
        self.user = User.objects.create_user(username="employe_depense", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=False)
        self.client.force_authenticate(user=self.user)

    def test_utilisateur_enregistre_a_la_creation(self):
        payload = {
            "titre": "Transport", "categorie": "TRANSPORT",
            "montant": "2000.00", "date_depense": "2026-08-30",
        }
        response = self.client.post(reverse('depenses-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        depense = Depense.objects.get(pk=response.data['id'])
        self.assertEqual(depense.utilisateur_id, self.user.id)
        self.assertEqual(response.data['utilisateur_nom'], 'employe_depense')

    def test_utilisateur_soumis_dans_le_payload_est_ignore(self):
        autre = User.objects.create_user(username="autre_employe", password="pass1234")
        payload = {
            "titre": "Transport", "categorie": "TRANSPORT",
            "montant": "2000.00", "date_depense": "2026-08-30", "utilisateur": autre.id,
        }
        response = self.client.post(reverse('depenses-list'), payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        depense = Depense.objects.get(pk=response.data['id'])
        self.assertEqual(depense.utilisateur_id, self.user.id)
