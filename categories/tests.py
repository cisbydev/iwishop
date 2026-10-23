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


# Images de catégories (plan validé par Mahamadou le 2026-10-23).
from io import BytesIO  # noqa: E402
from unittest.mock import patch  # noqa: E402

from PIL import ExifTags, Image  # noqa: E402
from django.core.files.storage import InMemoryStorage  # noqa: E402
from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.db import DatabaseError, connection  # noqa: E402
from django.test.utils import CaptureQueriesContext  # noqa: E402

from products.tests import (  # noqa: E402
    _StockageEnMemoireMixin, _fichiers_stockes, _photo_jpeg, fichier_non_image, image_trop_lourde, image_valide,
)


class CategorieImageApiTests(_StockageEnMemoireMixin, APITestCase):
    """POST et DELETE categories/{id}/image/ : image contrôlée, recadrée en
    carré de 320 px, ré-encodée en WebP et rangée par boutique ; ancien
    fichier supprimé après le commit ; mêmes refus que toute écriture sur
    une catégorie."""

    MESSAGE_FORMAT = "Format d'image non accepté. Choisissez une photo JPG ou PNG."

    def setUp(self):
        self.stockage = self._stockage_neuf()
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-image-categorie")
        self.proprietaire = User.objects.create_user(username="proprio_image", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.employe = User.objects.create_user(username="employe_image", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)
        self.categorie = Categorie.objects.create(boutique=self.boutique, nom="Boissons")
        self.url = reverse('categories-image', args=[self.categorie.id])
        self.chemin_attendu = rf'^categories/{self.boutique.id}/[0-9a-f]{{32}}\.webp$'

    def _fichiers(self):
        return _fichiers_stockes(self.stockage, 'categories')

    def _envoyer(self, fichier=None, user=None, **extra):
        self.client.force_authenticate(user=user or self.proprietaire)
        return self.client.post(self.url, {'image': fichier or _photo_jpeg()}, format='multipart', **extra)

    def _retirer(self, user=None, **extra):
        self.client.force_authenticate(user=user or self.proprietaire)
        return self.client.delete(self.url, **extra)

    def _image_en_place(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._envoyer().status_code, status.HTTP_200_OK)
        self.categorie.refresh_from_db()
        return self.categorie.image.name

    def test_envoi_enregistre_un_carre_webp_de_320_px_dans_le_dossier_de_la_boutique(self):
        response = self._envoyer(_photo_jpeg(taille=(1600, 1200)))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.categorie.refresh_from_db()
        nom = self.categorie.image.name
        self.assertRegex(nom, self.chemin_attendu)
        self.assertEqual(self._fichiers(), [nom])
        with self.stockage.open(nom) as fichier:
            image = Image.open(fichier)
            self.assertEqual((image.format, image.size), ('WEBP', (320, 320)))
        self.assertTrue(response.data['image'].endswith(nom))

    def test_position_gps_supprimee(self):
        exif = Image.Exif()
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps[ExifTags.GPS.GPSLatitudeRef] = 'N'
        gps[ExifTags.GPS.GPSLatitude] = (12.0, 39.0, 0.0)
        buffer = BytesIO()
        Image.new('RGB', (400, 400), 'red').save(buffer, format='JPEG', exif=exif)
        source = Image.open(BytesIO(buffer.getvalue()))
        self.assertIn(ExifTags.GPS.GPSLatitude, source.getexif().get_ifd(ExifTags.IFD.GPSInfo))

        self._envoyer(SimpleUploadedFile('IMG_0002.jpg', buffer.getvalue(), content_type='image/jpeg'))

        self.categorie.refresh_from_db()
        with self.stockage.open(self.categorie.image.name) as fichier:
            image = Image.open(fichier)
            image.load()
            self.assertEqual(len(image.getexif()), 0)
            self.assertNotIn('exif', image.info)

    def test_nom_du_fichier_envoye_jamais_utilise(self):
        buffer = BytesIO()
        Image.new('RGB', (50, 50), 'red').save(buffer, format='PNG')
        fichier = SimpleUploadedFile('../../x.php.jpg', buffer.getvalue(), content_type='image/jpeg')

        response = self._envoyer(fichier)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.categorie.refresh_from_db()
        self.assertRegex(self.categorie.image.name, self.chemin_attendu)
        self.assertNotIn('php', self.categorie.image.name)

    def test_fichiers_refuses_400_avec_message_sans_rien_stocker(self):
        gif = BytesIO()
        Image.new('RGB', (10, 10)).save(gif, format='GIF')
        cas = [
            ('texte nommé .jpg', fichier_non_image(), self.MESSAGE_FORMAT),
            ('GIF nommé .png', SimpleUploadedFile('image.png', gif.getvalue(), content_type='image/png'),
             self.MESSAGE_FORMAT),
            ('plus de 5 Mo', image_trop_lourde(), "L'image ne doit pas dépasser 5 Mo."),
        ]
        for libelle, fichier, message in cas:
            with self.subTest(libelle):
                response = self._envoyer(fichier)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data, [message])

        self.client.force_authenticate(user=self.proprietaire)
        response = self.client.post(self.url, {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, ["Aucune image envoyée."])

        self.categorie.refresh_from_db()
        self.assertFalse(self.categorie.image)
        self.assertEqual(self._fichiers(), [])

    def test_plus_de_40_megapixels_refuse(self):
        buffer = BytesIO()
        Image.new('1', (8000, 5001)).save(buffer, format='PNG')

        response = self._envoyer(SimpleUploadedFile('grande.png', buffer.getvalue(), content_type='image/png'))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, ["L'image est trop grande (40 mégapixels au plus)."])
        self.assertEqual(self._fichiers(), [])

    def test_remplacement_supprime_l_ancien_fichier_seulement_apres_le_commit(self):
        ancien = self._image_en_place()

        with self.captureOnCommitCallbacks() as callbacks:
            response = self._envoyer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.categorie.refresh_from_db()
        nouveau = self.categorie.image.name
        self.assertNotEqual(nouveau, ancien)
        # Avant le commit, les deux fichiers sont encore là.
        self.assertEqual(self._fichiers(), sorted([ancien, nouveau]))
        for callback in callbacks:
            callback()
        self.assertEqual(self._fichiers(), [nouveau])

    def test_echec_de_la_base_supprime_le_nouveau_fichier_et_garde_l_ancien(self):
        ancien = self._image_en_place()

        with self.captureOnCommitCallbacks() as callbacks:
            with patch.object(Categorie, 'save', side_effect=DatabaseError("panne simulée")):
                with self.assertRaises(DatabaseError):
                    self._envoyer()

        self.assertEqual(callbacks, [])
        self.categorie.refresh_from_db()
        self.assertEqual(self.categorie.image.name, ancien)
        self.assertEqual(self._fichiers(), [ancien])

    def test_retrait_supprime_le_fichier(self):
        self._image_en_place()

        with self.captureOnCommitCallbacks(execute=True):
            response = self._retirer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['image'])
        self.categorie.refresh_from_db()
        self.assertFalse(self.categorie.image)
        self.assertEqual(self._fichiers(), [])

    def test_retrait_sans_image_ne_fait_rien(self):
        with self.captureOnCommitCallbacks() as callbacks:
            response = self._retirer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(callbacks, [])

    def test_suppression_de_la_categorie_supprime_son_image(self):
        self._image_en_place()
        self.client.force_authenticate(user=self.proprietaire)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(reverse('categories-detail', args=[self.categorie.id]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self._fichiers(), [])

    def test_suppression_refusee_de_la_categorie_garde_son_image(self):
        nom = self._image_en_place()
        self.client.force_authenticate(user=self.employe)

        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            response = self.client.delete(reverse('categories-detail', args=[self.categorie.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(callbacks, [])
        self.assertEqual(self._fichiers(), [nom])

    def test_echec_de_suppression_dans_le_stockage_journalise_sans_bloquer(self):
        ancien = self._image_en_place()

        with patch.object(InMemoryStorage, 'delete', side_effect=OSError("R2 injoignable")):
            with self.assertLogs('products.photos', level='ERROR') as journaux:
                with self.captureOnCommitCallbacks(execute=True):
                    response = self._envoyer()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(ancien, journaux.output[0])
        # Au pire, l'ancien fichier reste orphelin.
        self.assertEqual(len(self._fichiers()), 2)

    def test_categorie_d_une_autre_boutique_meme_404_qu_une_categorie_inexistante(self):
        boutique_b = Boutique.objects.create(nom="Boutique B", slug="boutique-image-categorie-b")
        user_b = User.objects.create_user(username="proprio_image_b", password="pass1234")
        Profil.objects.create(user=user_b, boutique=boutique_b, est_proprietaire=True)
        nom = self._image_en_place()
        inexistante = reverse('categories-image', args=[Categorie.objects.order_by('-pk').first().pk + 1000])
        self.client.force_authenticate(user=user_b)

        for methode in ('post', 'delete'):
            with self.subTest(methode):
                envoi = getattr(self.client, methode)
                autre = envoi(self.url, {'image': _photo_jpeg()}, format='multipart')
                absente = envoi(inexistante, {'image': _photo_jpeg()}, format='multipart')
                self.assertEqual(autre.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual((autre.status_code, autre.data), (absente.status_code, absente.data))

        self.categorie.refresh_from_db()
        self.assertEqual(self.categorie.image.name, nom)
        self.assertEqual(self._fichiers(), [nom])

    def test_vue_support_refusee(self):
        nom = self._image_en_place()
        admin = User.objects.create_superuser(username="admin_image", email="admin@example.com", password="x")
        entete = {'HTTP_X_SUPPORT_BOUTIQUE': str(self.boutique.id)}

        for response in (self._envoyer(user=admin, **entete), self._retirer(user=admin, **entete)):
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(response.data['detail'], "La Vue Support est en lecture seule.")

        self.categorie.refresh_from_db()
        self.assertEqual(self.categorie.image.name, nom)
        self.assertEqual(self._fichiers(), [nom])

    def test_abonnement_expire_refuse(self):
        nom = self._image_en_place()
        formule = FormuleAbonnement.objects.create(nom="Standard", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timezone.timedelta(days=40),
            date_fin=timezone.localdate() - timezone.timedelta(days=10),
            statut='EXPIRE',
        )

        for response in (self._envoyer(), self._retirer()):
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(response.data['code'], 'ABONNEMENT_EXPIRE')

        self.categorie.refresh_from_db()
        self.assertEqual(self.categorie.image.name, nom)
        self.assertEqual(self._fichiers(), [nom])

    def test_employe_peut_envoyer_et_retirer(self):
        self.assertEqual(self._envoyer(user=self.employe).status_code, status.HTTP_200_OK)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._retirer(user=self.employe).status_code, status.HTTP_200_OK)
        self.assertEqual(self._fichiers(), [])


class CategorieImageLectureSeuleTests(_StockageEnMemoireMixin, APITestCase):
    """Dans la catégorie, `image` est en lecture seule (son URL) : une image
    envoyée avec la catégorie ne passerait par aucun contrôle."""

    def setUp(self):
        self.stockage = self._stockage_neuf()
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-image-lecture-seule")
        self.user = User.objects.create_user(username="user_image", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.user)

    def test_image_envoyee_avec_la_categorie_ignoree(self):
        creation = self.client.post(
            reverse('categories-list'), {'nom': 'Épicerie', 'image': image_valide()}, format='multipart',
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(creation.data['image'])

        url_detail = reverse('categories-detail', args=[creation.data['id']])
        modification = self.client.patch(url_detail, {'image': image_valide()}, format='multipart')

        self.assertEqual(modification.status_code, status.HTTP_200_OK)
        self.assertIsNone(modification.data['image'])
        self.assertEqual(_fichiers_stockes(self.stockage, 'categories'), [])

    def test_liste_avec_images_nombre_de_requetes_constant(self):
        def creer(n):
            for i in range(n):
                Categorie.objects.create(
                    boutique=self.boutique, nom=f"Catégorie {i}-{n}",
                    image=f"categories/{self.boutique.id}/{i}-{n}.webp",
                )

        creer(2)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as premier:
            self.client.get(reverse('categories-list'))
        creer(5)
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        with CaptureQueriesContext(connection) as second:
            response = self.client.get(reverse('categories-list'))

        self.assertEqual(len(response.data['results']), 7)
        self.assertTrue(all(c['image'] for c in response.data['results']))
        self.assertEqual(len(premier.captured_queries), len(second.captured_queries))


class CategorieImageMigrationCompatibiliteTests(APITestCase):
    """Pendant un déploiement, l'ancien code insère des catégories sans la
    colonne `image` (CLAUDE.md, Migrations) : l'INSERT en SQL brut, avec
    seulement les anciennes colonnes, doit réussir et laisser `image` vide."""

    def test_insert_sans_la_colonne_image(self):
        boutique = Boutique.objects.create(nom="Boutique", slug="boutique-image-migration")

        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO categories_categorie (boutique_id, nom, description, date_creation) "
                "VALUES (%s, %s, %s, NOW())",
                [boutique.id, 'Ancien code', None],
            )

        categorie = Categorie.objects.get(boutique=boutique, nom='Ancien code')
        self.assertFalse(categorie.image)
