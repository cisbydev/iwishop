from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from .models import ParametresBoutique


class ParametresBoutiqueIsolationTests(APITestCase):
    """Sécurité : les paramètres d'une boutique ne doivent jamais pouvoir
    être réassignés à une autre boutique via le champ `boutique`."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b")

        self.user_b = User.objects.create_user(username="user_b", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.parametres_b = ParametresBoutique.objects.create(
            boutique=self.boutique_b, nom_boutique="Boutique B"
        )

        self.url = reverse('parametres-boutique')

    def test_patch_ne_peut_pas_reassigner_la_boutique(self):
        self.client.force_authenticate(user=self.user_b)
        response = self.client.patch(self.url, {"boutique": self.boutique_a.id, "nom_boutique": "Nouveau nom"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.parametres_b.refresh_from_db()
        self.assertEqual(self.parametres_b.boutique_id, self.boutique_b.id)
        self.assertEqual(self.parametres_b.nom_boutique, "Nouveau nom")
        self.assertFalse(ParametresBoutique.objects.filter(boutique=self.boutique_a).exists())


class ParametresBoutiqueModificationPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut modifier les
    paramètres de la boutique ; la lecture reste ouverte à l'employé
    (non-régression)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-parametres")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.parametres = ParametresBoutique.objects.create(
            boutique=self.boutique, nom_boutique="Boutique"
        )
        self.url = reverse('parametres-boutique')

    def test_employe_peut_lire(self):
        """Non-régression : la lecture reste ouverte à l'employé."""
        self.client.force_authenticate(user=self.employe)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_employe_ne_peut_pas_modifier(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.patch(self.url, {"nom_boutique": "Nouveau nom"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.parametres.refresh_from_db()
        self.assertEqual(self.parametres.nom_boutique, "Boutique")

    def test_proprietaire_peut_modifier(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.patch(self.url, {"nom_boutique": "Nouveau nom"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.parametres.refresh_from_db()
        self.assertEqual(self.parametres.nom_boutique, "Nouveau nom")


class ParametresBoutiqueAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 : une boutique dont l'abonnement a
    expiré ne doit plus pouvoir lire ni modifier ses paramètres.
    ParametresBoutiqueView n'utilisait pas BoutiqueScopedMixin du tout ;
    get_object() était une méthode maison qui ne vérifiait ni `actif` ni
    `abonnement_valide()`."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-parametres")
        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        ParametresBoutique.objects.create(boutique=self.boutique, nom_boutique="Boutique")
        self.url = reverse('parametres-boutique')

    def _expirer_abonnement(self):
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

    def test_lecture_refusee_si_abonnement_expire(self):
        self._expirer_abonnement()
        self.client.force_authenticate(user=self.proprietaire)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))

    def test_modification_refusee_si_abonnement_expire(self):
        self._expirer_abonnement()
        self.client.force_authenticate(user=self.proprietaire)

        response = self.client.patch(self.url, {"nom_boutique": "Tentative"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))

    def test_lecture_et_modification_autorisees_sans_abonnement_configure(self):
        """Non-régression : une boutique sans Abonnement du tout doit
        continuer à lire/modifier ses paramètres normalement."""
        self.client.force_authenticate(user=self.proprietaire)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch(self.url, {"nom_boutique": "Nouveau nom"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
