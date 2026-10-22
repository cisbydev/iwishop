from io import StringIO
from unittest import mock

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone

from products.models import Produit
from sales.models import Vente
from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil


def lancer(**options):
    call_command('seed_demo', mot_de_passe='demo-test', stdout=StringIO(), **options)


class SeedDemoGardeTests(TestCase):
    """seed_demo ne doit jamais écrire hors d'une base locale."""

    def compter(self):
        return (User.objects.count(), Boutique.objects.count(), Produit.objects.count(), Vente.objects.count())

    @override_settings(DEBUG=False)
    def test_refuse_sans_debug(self):
        avant = self.compter()
        with self.assertRaisesMessage(CommandError, 'sans DEBUG'):
            lancer()
        self.assertEqual(self.compter(), avant)

    @override_settings(DEBUG=True)
    def test_refuse_un_hote_distant(self):
        reglages = {**connection.settings_dict, 'ENGINE': 'django.db.backends.postgresql', 'HOST': 'dpg-exemple.oregon-postgres.render.com'}
        avant = self.compter()
        with mock.patch.dict(connection.settings_dict, reglages):
            with self.assertRaisesMessage(CommandError, 'hors de localhost'):
                lancer()
        self.assertEqual(self.compter(), avant)

    @override_settings(DEBUG=True)
    def test_refuse_un_hote_non_precise(self):
        reglages = {**connection.settings_dict, 'ENGINE': 'django.db.backends.postgresql', 'HOST': ''}
        with mock.patch.dict(connection.settings_dict, reglages):
            with self.assertRaisesMessage(CommandError, 'hors de localhost'):
                lancer()
        self.assertFalse(User.objects.filter(username='demo').exists())


@override_settings(DEBUG=True)
class SeedDemoContenuTests(TestCase):
    def test_cree_deux_boutiques_et_des_ventes_par_l_api(self):
        with mock.patch.dict(connection.settings_dict, {'HOST': 'localhost'}):
            lancer()
        demo = User.objects.get(username='demo')
        boutiques = Boutique.objects.filter(membres__user=demo, membres__est_proprietaire=True)
        self.assertEqual(boutiques.count(), 2)
        self.assertEqual(Profil.objects.filter(user=demo).count(), 2)
        # Ventes créées par l'API : stock décrémenté par le vrai code.
        self.assertEqual(Vente.objects.filter(boutique__in=boutiques).count(), 9)
        riz = Produit.objects.get(boutique=boutiques.order_by('id').first(), nom='Riz parfumé 25 kg')
        self.assertEqual(riz.quantite_en_stock, 30 - 5)
        # Cinq produits sous leur stock minimum dans la première boutique.
        premiere = boutiques.order_by('id').first()
        faibles = [p for p in Produit.objects.filter(boutique=premiere) if p.quantite_en_stock <= p.stock_minimum]
        self.assertEqual(len(faibles), 5)

    def test_chaque_boutique_a_un_abonnement_actif_d_un_an(self):
        with mock.patch.dict(connection.settings_dict, {'HOST': 'localhost'}):
            lancer()
        boutiques = Boutique.objects.filter(membres__user__username='demo')
        aujourdhui = timezone.localdate()
        self.assertEqual(Abonnement.objects.filter(boutique__in=boutiques).count(), 2)
        for boutique in boutiques:
            abonnement = boutique.abonnement
            self.assertEqual(abonnement.formule.nom, '1 MOIS')
            self.assertEqual(abonnement.statut, 'ACTIF')
            self.assertEqual(abonnement.date_debut, aujourdhui)
            self.assertEqual(abonnement.date_fin, aujourdhui + timezone.timedelta(days=365))
        formule = FormuleAbonnement.objects.get(nom='1 MOIS')
        self.assertEqual((formule.duree_jours, formule.prix, formule.actif), (30, 15000, True))

    def test_reutilise_la_formule_1_mois_existante(self):
        existante = FormuleAbonnement.objects.create(
            nom='1 MOIS', duree_jours=30, prix=15000, actif=True, palier=FormuleAbonnement.Palier.ESSENTIEL,
        )
        with mock.patch.dict(connection.settings_dict, {'HOST': 'localhost'}):
            lancer()
        self.assertEqual(FormuleAbonnement.objects.filter(nom='1 MOIS').count(), 1)
        self.assertEqual(
            set(Abonnement.objects.filter(boutique__membres__user__username='demo').values_list('formule', flat=True)),
            {existante.pk},
        )

    def test_la_demo_marche_sans_la_regle_pas_d_abonnement_egal_acces(self):
        # Simule la fermeture du trou : sans Abonnement, aucun accès. Les
        # ventes de démonstration passent par l'API, donc par ce contrôle.
        def abonnement_valide_strict(boutique):
            if not hasattr(boutique, 'abonnement'):
                return False
            aujourdhui = timezone.localdate()
            abonnement = boutique.abonnement
            return abonnement.statut == 'ACTIF' and abonnement.date_debut <= aujourdhui <= abonnement.date_fin

        with (
            mock.patch.dict(connection.settings_dict, {'HOST': 'localhost'}),
            mock.patch.object(Boutique, 'abonnement_valide', abonnement_valide_strict),
        ):
            lancer()
        self.assertEqual(Vente.objects.filter(boutique__membres__user__username='demo').count(), 9)

    def test_refuse_un_second_lancement(self):
        with mock.patch.dict(connection.settings_dict, {'HOST': 'localhost'}):
            lancer()
            nombre = Vente.objects.count()
            with self.assertRaisesMessage(CommandError, 'existe déjà'):
                lancer()
        self.assertEqual(Vente.objects.count(), nombre)
