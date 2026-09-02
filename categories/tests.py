from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil
from .models import Categorie


class CategorieDestroyPermissionTests(APITestCase):
    """P1 point 6 (RBAC) : seul le propriétaire peut supprimer une
    catégorie ; la création/modification restent ouvertes à l'employé
    (non-régression)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-rbac-categorie")

        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)

        self.employe = User.objects.create_user(username="employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)

        self.categorie = Categorie.objects.create(boutique=self.boutique, nom="Boissons")
        self.url_detail = reverse('categories-detail', args=[self.categorie.id])

    def test_employe_ne_peut_pas_supprimer(self):
        self.client.force_authenticate(user=self.employe)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Categorie.objects.filter(pk=self.categorie.id).exists())

    def test_employe_peut_toujours_creer_et_modifier(self):
        """Non-régression : création et modification restent ouvertes à l'employé."""
        self.client.force_authenticate(user=self.employe)
        response = self.client.post(reverse('categories-list'), {"nom": "Épicerie"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.patch(self.url_detail, {"nom": "Boissons fraîches"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_proprietaire_peut_supprimer(self):
        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.delete(self.url_detail)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Categorie.objects.filter(pk=self.categorie.id).exists())


class CategorieEcritureAbonnementExpireTests(APITestCase):
    """Audit complémentaire point 1 bis : PATCH/DELETE sur Categorie
    n'étaient protégés qu'implicitement par get_queryset() (via
    get_object()) ; ils doivent maintenant appeler _verifier_acces()
    eux-mêmes (perform_update/perform_destroy du mixin) - sans quoi le
    contrôle scindé lecture/écriture réintroduirait la faille déjà fermée
    (audit complémentaire point 1). La lecture (GET), elle, reste permise."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-abo-expire-ecriture-categorie")
        self.proprietaire = User.objects.create_user(username="proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.proprietaire)

        self.categorie = Categorie.objects.create(boutique=self.boutique, nom="Boissons")

        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

    def test_lecture_autorisee_si_abonnement_expire(self):
        response = self.client.get(reverse('categories-detail', args=[self.categorie.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_refuse_si_abonnement_expire(self):
        response = self.client.patch(
            reverse('categories-detail', args=[self.categorie.id]), {"nom": "Tentative"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Abonnement expiré", str(response.data))
        self.categorie.refresh_from_db()
        self.assertEqual(self.categorie.nom, "Boissons")

    def test_delete_refuse_si_abonnement_expire(self):
        response = self.client.delete(reverse('categories-detail', args=[self.categorie.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Categorie.objects.filter(pk=self.categorie.id).exists())


class CategorieUniciteParBoutiqueTests(APITestCase):
    """Audit point 9 : Categorie.nom était unique GLOBALEMENT plutôt que
    par boutique - deux boutiques différentes ne pouvaient pas chacune
    avoir une catégorie "Alimentation". Passé en unique_together
    (boutique, nom). Vérifie aussi que l'ajout de CurrentBoutiqueDefault()
    (nécessaire pour que DRF valide côté serializer) ne fait pas d'un
    doublon dans la MÊME boutique une IntegrityError non gérée (500) au
    lieu d'un 400 propre."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique A", slug="boutique-a-unicite-categorie")
        self.boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-b-unicite-categorie")

        self.user_a = User.objects.create_user(username="user_a_categorie", password="pass1234")
        Profil.objects.create(user=self.user_a, boutique=self.boutique_a, est_proprietaire=True)

        self.user_b = User.objects.create_user(username="user_b_categorie", password="pass1234")
        Profil.objects.create(user=self.user_b, boutique=self.boutique_b, est_proprietaire=True)

        self.url_list = reverse('categories-list')

    def test_deux_boutiques_peuvent_avoir_la_meme_categorie(self):
        """Reproduit exactement le scénario bloqué avant la correction."""
        Categorie.objects.create(boutique=self.boutique_a, nom="Alimentation")

        self.client.force_authenticate(user=self.user_b)
        response = self.client.post(self.url_list, {"nom": "Alimentation"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Categorie.objects.filter(nom="Alimentation").count(), 2
        )

    def test_meme_boutique_deux_categories_meme_nom_refusee_400_pas_500(self):
        """La contrainte doit rester active DANS une même boutique - et
        remonter une 400 propre (validateur DRF), pas une IntegrityError
        non gérée."""
        Categorie.objects.create(boutique=self.boutique_a, nom="Boissons")

        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(self.url_list, {"nom": "Boissons"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Categorie.objects.filter(boutique=self.boutique_a, nom="Boissons").count(), 1)

    def test_patch_vers_nom_utilise_par_une_autre_boutique_autorise(self):
        """Non-régression sur la modification : renommer vers un nom déjà
        pris par une AUTRE boutique doit rester possible."""
        Categorie.objects.create(boutique=self.boutique_b, nom="Épicerie")
        categorie_a = Categorie.objects.create(boutique=self.boutique_a, nom="Autre")

        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            reverse('categories-detail', args=[categorie_a.id]), {"nom": "Épicerie"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_vers_nom_deja_utilise_dans_la_meme_boutique_refuse(self):
        """Non-régression : renommer vers un nom déjà pris dans SA PROPRE
        boutique reste refusé (400 propre)."""
        Categorie.objects.create(boutique=self.boutique_a, nom="Boissons")
        categorie_a = Categorie.objects.create(boutique=self.boutique_a, nom="Autre")

        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            reverse('categories-detail', args=[categorie_a.id]), {"nom": "Boissons"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
