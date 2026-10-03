import threading
import time
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient, APITestCase

from products.models import Produit, UniteVente
from purchases.models import Achat
from purchases.services.dette import corriger_paiement, enregistrer_paiement
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


class DetteFournisseurBase(APITestCase):
    """Données communes aux tests des dettes fournisseurs (commit 5)."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-dette-fournisseur")
        self.proprio = User.objects.create_user(username="proprio_dette_f", password="pass1234")
        Profil.objects.create(user=self.proprio, boutique=self.boutique, est_proprietaire=True)
        self.employe = User.objects.create_user(username="employe_dette_f", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Alpha")
        self.client.force_authenticate(user=self.proprio)

    def _achat(self, fournisseur=None, total="300", acompte="100", statut='VALIDE', il_y_a_jours=0):
        total, acompte = Decimal(total), Decimal(acompte)
        du = total - acompte
        achat = Achat.objects.create(
            boutique=(fournisseur or self.fournisseur).boutique, fournisseur=fournisseur or self.fournisseur,
            montant_total=total, montant_paye=acompte, montant_du=du, statut=statut,
            statut_paiement='paye' if du == 0 else ('partiel' if acompte > 0 else 'en_attente'),
        )
        if il_y_a_jours:
            Achat.objects.filter(pk=achat.pk).update(date_achat=timezone.now() - timedelta(days=il_y_a_jours))
            achat.refresh_from_db()
        return achat

    def _payer(self, achat, montant, mode_paiement='ESPECES'):
        return enregistrer_paiement(achat, Decimal(montant), self.proprio, mode_paiement=mode_paiement)


class FournisseursAvecDetteTests(DetteFournisseurBase):

    def _get(self, **en_tetes):
        return self.client.get(reverse('fournisseurs-avec-dette'), **en_tetes)

    def _resultats(self, response):
        return response.data['results'] if isinstance(response.data, dict) else response.data

    def test_seuls_les_fournisseurs_avec_dette(self):
        Fournisseur.objects.create(boutique=self.boutique, nom="Sans achat")
        comptant = Fournisseur.objects.create(boutique=self.boutique, nom="Comptant")
        self._achat(comptant, total="300", acompte="300")
        self._achat(total="300", acompte="100")

        resultats = self._resultats(self._get())

        self.assertEqual(len(resultats), 1)
        self.assertEqual(resultats[0]['nom'], "Alpha")
        self.assertEqual(resultats[0]['dette_totale'], "200.00")

    def test_plusieurs_achats_et_paiements_ne_gonflent_pas_la_dette(self):
        # Les jointures ne doivent pas multiplier les lignes : 3 achats à
        # crédit, dont un avec 3 paiements et une correction.
        a1 = self._achat(total="500", acompte="0")      # dû 500
        self._achat(total="300", acompte="100")         # dû 200
        self._achat(total="80", acompte="30")           # dû 50
        p1 = self._payer(a1, "100")
        self._payer(a1, "50")
        self._payer(a1, "25")
        corriger_paiement(p1, Decimal("90"), "Erreur", self.proprio)  # a1 : 500 - 165 = 335
        self.assertEqual(a1.paiements.count(), 4)

        resultats = self._resultats(self._get())

        self.assertEqual(len(resultats), 1)
        self.assertEqual(resultats[0]['dette_totale'], "585.00")

    def test_annule_comptant_et_solde_ne_comptent_pas(self):
        self._achat(total="300", acompte="100", statut='ANNULE')
        self._achat(total="300", acompte="300")
        solde = self._achat(total="100", acompte="40")
        self._payer(solde, "60")

        self.assertEqual(self._resultats(self._get()), [])

    def test_un_paiement_fait_baisser_la_dette(self):
        achat = self._achat(total="300", acompte="100")
        self._payer(achat, "75")

        self.assertEqual(self._resultats(self._get())[0]['dette_totale'], "125.00")

    def test_tri_par_dette_decroissante_et_plus_ancienne_dette(self):
        beta = Fournisseur.objects.create(boutique=self.boutique, nom="Beta")
        self._achat(total="100", acompte="0", il_y_a_jours=2)
        ancien = self._achat(total="50", acompte="0", il_y_a_jours=10)
        self._achat(beta, total="900", acompte="0", il_y_a_jours=1)

        resultats = self._resultats(self._get())

        self.assertEqual([r['nom'] for r in resultats], ["Beta", "Alpha"])
        self.assertEqual(resultats[1]['dette_totale'], "150.00")
        self.assertEqual(
            resultats[1]['plus_ancienne_dette'],
            serializers_datetime(ancien.date_achat),
        )

    def test_isolation_entre_boutiques(self):
        autre = Boutique.objects.create(nom="Autre", slug="autre-dette-fournisseur")
        self._achat(Fournisseur.objects.create(boutique=autre, nom="Ailleurs"), total="999", acompte="0")
        self._achat(total="300", acompte="100")

        resultats = self._resultats(self._get())

        self.assertEqual([r['nom'] for r in resultats], ["Alpha"])

    def test_vue_support_lit_les_dettes(self):
        self._achat(total="300", acompte="100")
        admin = User.objects.create_superuser(username="admin_dette_f", password="pass1234")
        self.client.force_authenticate(user=admin)

        response = self._get(HTTP_X_SUPPORT_BOUTIQUE=str(self.boutique.id))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._resultats(response)[0]['dette_totale'], "200.00")

    def test_lecture_permise_si_abonnement_expire(self):
        self._achat(total="300", acompte="100")
        formule = FormuleAbonnement.objects.create(nom="F", duree_jours=30, prix=5000)
        Abonnement.objects.create(
            boutique=self.boutique, formule=formule,
            date_debut=timezone.localdate() - timedelta(days=40),
            date_fin=timezone.localdate() - timedelta(days=10), statut='EXPIRE',
        )

        response = self._get()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._resultats(response)), 1)

    def test_employe_lit_les_dettes(self):
        # D3 : l'employé enregistre des paiements, il doit voir les dettes.
        self._achat(total="300", acompte="100")
        self.client.force_authenticate(user=self.employe)

        self.assertEqual(self._get().status_code, status.HTTP_200_OK)


def serializers_datetime(valeur):
    from rest_framework import serializers
    return serializers.DateTimeField().to_representation(valeur)


class HistoriqueFournisseurTests(DetteFournisseurBase):

    def _get(self, fournisseur=None, **en_tetes):
        return self.client.get(
            reverse('fournisseurs-historique', args=[(fournisseur or self.fournisseur).id]), **en_tetes
        )

    def test_seulement_les_achats_crees_a_credit(self):
        self._achat(total="300", acompte="300")                       # comptant : exclu
        solde = self._achat(total="100", acompte="40")
        self._payer(solde, "60")                                      # soldé depuis : inclus
        annule = self._achat(total="200", acompte="0", statut='ANNULE')  # annulé : inclus
        en_cours = self._achat(total="300", acompte="100")

        data = self._get().data

        self.assertEqual(len(data), 3)
        self.assertEqual({a['id'] for a in data}, {solde.id, annule.id, en_cours.id})
        par_id = {a['id']: a for a in data}
        self.assertEqual(par_id[solde.id]['statut_paiement'], 'paye')
        self.assertEqual(par_id[solde.id]['montant_paye'], "40.00")
        self.assertEqual(par_id[annule.id]['statut'], 'ANNULE')

    def test_regroupement_et_montants_calcules_par_le_serveur(self):
        achat = self._achat(total="500", acompte="100")
        p1 = self._payer(achat, "100", mode_paiement='MOBILE_MONEY')
        p2 = self._payer(achat, "50")
        corriger_paiement(p1, Decimal("80"), "Erreur de saisie", self.proprio)
        corriger_paiement(p1, Decimal("90"), "Reçu retrouvé", self.proprio)

        donnees_achat = self._get().data[0]

        self.assertEqual(donnees_achat['total_paiements'], "140.00")
        self.assertEqual(donnees_achat['montant_du'], "260.00")
        paiements = donnees_achat['paiements']
        self.assertEqual([p['id'] for p in paiements], [p1.id, p2.id])
        premier = paiements[0]
        self.assertEqual(premier['montant'], "100.00")
        self.assertEqual(premier['montant_effectif'], "90.00")
        self.assertEqual(premier['mode_paiement'], 'MOBILE_MONEY')
        self.assertEqual(premier['enregistre_par_nom'], 'proprio_dette_f')
        self.assertEqual([c['montant'] for c in premier['corrections']], ["-20.00", "10.00"])
        self.assertEqual(premier['corrections'][1]['motif_correction'], "Reçu retrouvé")
        self.assertEqual(paiements[1]['montant_effectif'], "50.00")
        self.assertEqual(paiements[1]['corrections'], [])

    def test_fournisseur_autre_boutique_introuvable(self):
        autre = Boutique.objects.create(nom="Autre", slug="autre-historique-fournisseur")
        ailleurs = Fournisseur.objects.create(boutique=autre, nom="Ailleurs")
        self._achat(ailleurs, total="300", acompte="0")

        response = self._get(ailleurs)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_vue_support_lit_lhistorique(self):
        self._achat(total="300", acompte="100")
        admin = User.objects.create_superuser(username="admin_historique_f", password="pass1234")
        self.client.force_authenticate(user=admin)

        response = self._get(HTTP_X_SUPPORT_BOUTIQUE=str(self.boutique.id))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def _compter_requetes(self):
        with CaptureQueriesContext(connection) as contexte:
            response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return len(contexte.captured_queries)

    def test_nombre_de_requetes_constant(self):
        def ajouter(n):
            for _ in range(n):
                achat = self._achat(total="300", acompte="0")
                p = self._payer(achat, "50")
                self._payer(achat, "20")
                corriger_paiement(p, Decimal("40"), "Erreur", self.proprio)

        ajouter(1)
        avec_un = self._compter_requetes()
        ajouter(5)
        avec_six = self._compter_requetes()

        self.assertEqual(avec_un, avec_six)


class SuppressionFournisseurDetteTests(DetteFournisseurBase):
    """D5 : la suppression d'un fournisseur est refusée tant qu'il reste
    une dette."""

    def _supprimer(self):
        return self.client.delete(reverse('fournisseurs-detail', args=[self.fournisseur.id]))

    def test_refusee_sil_reste_une_dette(self):
        self._achat(total="300", acompte="170")

        response = self._supprimer()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("encore une dette de 130 FCFA", str(response.data))
        self.assertTrue(Fournisseur.objects.filter(pk=self.fournisseur.pk).exists())

    def test_acceptee_une_fois_la_dette_soldee(self):
        achat = self._achat(total="300", acompte="100")
        self._payer(achat, "200")

        response = self._supprimer()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Fournisseur.objects.filter(pk=self.fournisseur.pk).exists())
        achat.refresh_from_db()
        self.assertIsNone(achat.fournisseur_id)

    def test_acceptee_si_le_seul_achat_a_credit_est_annule(self):
        self._achat(total="300", acompte="0", statut='ANNULE')

        response = self._supprimer()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_acceptee_sans_achat_a_credit(self):
        self._achat(total="300", acompte="300")

        response = self._supprimer()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class SuppressionFournisseurConcurrenceTests(TransactionTestCase):
    """D5 sous concurrence : un achat à crédit est en cours de création
    pour le fournisseur (ligne Achat insérée, transaction ouverte) pendant
    qu'on le supprime. La suppression doit attendre le verrou, voir la
    nouvelle dette, et refuser. Entrelacement forcé, comme pour les
    paiements fournisseurs."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique", slug="boutique-concurrence-suppression")
        self.user = User.objects.create_user(username="proprio_concurrence_suppr", password="pass1234")
        Profil.objects.create(user=self.user, boutique=self.boutique, est_proprietaire=True)
        self.fournisseur = Fournisseur.objects.create(boutique=self.boutique, nom="Fournisseur")
        self.unite = UniteVente.objects.create(
            boutique=self.boutique, nom="Unité", facteur_conversion=Decimal("1.000"), est_systeme=True
        )
        self.produit = Produit.objects.create(
            boutique=self.boutique, nom="Produit",
            prix_achat=Decimal("50"), prix_unitaire=Decimal("100"), prix_douzaine=Decimal("1200"),
            quantite_en_stock=0,
        )

    def _attente_sur_verrou(self, pid):
        with connection.cursor() as cursor:
            cursor.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", [pid])
            ligne = cursor.fetchone()
        return ligne is not None and ligne[0] == 'Lock'

    def test_suppression_attend_lachat_a_credit_puis_est_refusee(self):
        achat_en_pause = threading.Event()
        liberer_achat = threading.Event()
        pid_suppression = []
        resultats = {}

        # Appelé par AchatSerializer.create() après l'insertion de l'achat
        # et de sa ligne : la transaction de l'achat est ouverte.
        def pause_apres_insertion(produit):
            achat_en_pause.set()
            liberer_achat.wait(timeout=10)

        def client():
            c = APIClient()
            c.force_authenticate(user=self.user)
            return c

        def acheter_a_credit():
            try:
                response = client().post(reverse('achats-list'), {
                    "fournisseur": self.fournisseur.id, "montant_paye": "50",
                    "lignes": [{
                        "produit": self.produit.id, "quantite": 3,
                        "unite": self.unite.id, "prix_unitaire_achat": "60.00",
                    }],
                }, format='json')
                resultats['achat'] = response.status_code
            except Exception as erreur:
                resultats['achat'] = repr(erreur)
            finally:
                connection.close()

        def supprimer():
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid()")
                    pid_suppression.append(cursor.fetchone()[0])
                response = client().delete(reverse('fournisseurs-detail', args=[self.fournisseur.id]))
                resultats['suppression'] = (response.status_code, str(response.data))
            except Exception as erreur:
                resultats['suppression'] = repr(erreur)
            finally:
                connection.close()

        with patch('purchases.serializers.verifier_stock_bas', side_effect=pause_apres_insertion):
            thread_achat = threading.Thread(target=acheter_a_credit)
            thread_achat.start()
            self.assertTrue(achat_en_pause.wait(timeout=10), resultats)

            thread_suppression = threading.Thread(target=supprimer)
            thread_suppression.start()
            limite = time.monotonic() + 10
            suppression_bloquee = False
            while time.monotonic() < limite and thread_suppression.is_alive():
                if pid_suppression and self._attente_sur_verrou(pid_suppression[0]):
                    suppression_bloquee = True
                    break
                time.sleep(0.01)

            liberer_achat.set()
            thread_achat.join(timeout=15)
            thread_suppression.join(timeout=15)

        self.assertTrue(suppression_bloquee, f"La suppression aurait dû attendre : {resultats}")
        self.assertEqual(resultats.get('achat'), status.HTTP_201_CREATED, resultats)
        code, message = resultats.get('suppression', (None, ''))
        self.assertEqual(code, status.HTTP_400_BAD_REQUEST, resultats)
        self.assertIn("encore une dette de 130 FCFA", message)
        self.assertTrue(Fournisseur.objects.filter(pk=self.fournisseur.pk).exists())
        achat = Achat.objects.get(boutique=self.boutique)
        self.assertEqual(achat.fournisseur_id, self.fournisseur.pk)
        self.assertEqual(achat.montant_du, Decimal("130.00"))

    def test_suppression_dabord_puis_creation_reponse_de_fournisseur_inexistant(self):
        # Cas inverse : la suppression tient le verrou ; l'achat, déjà
        # validé (le fournisseur existait), attend ce verrou puis trouve le
        # fournisseur disparu. Réponse propre, identique à celle d'un
        # fournisseur inexistant, et aucun achat créé.
        suppression_en_pause = threading.Event()
        liberer_suppression = threading.Event()
        pid_achat = []
        resultats = {}
        delete_original = Fournisseur.delete

        def delete_avec_pause(instance, *args, **kwargs):
            suppression_en_pause.set()
            liberer_suppression.wait(timeout=10)
            return delete_original(instance, *args, **kwargs)

        def client():
            c = APIClient()
            c.force_authenticate(user=self.user)
            return c

        payload = {
            "fournisseur": self.fournisseur.id, "montant_paye": "50",
            "lignes": [{
                "produit": self.produit.id, "quantite": 3,
                "unite": self.unite.id, "prix_unitaire_achat": "60.00",
            }],
        }

        def supprimer():
            try:
                response = client().delete(reverse('fournisseurs-detail', args=[self.fournisseur.id]))
                resultats['suppression'] = response.status_code
            except Exception as erreur:
                resultats['suppression'] = repr(erreur)
            finally:
                connection.close()

        def acheter():
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid()")
                    pid_achat.append(cursor.fetchone()[0])
                response = client().post(reverse('achats-list'), payload, format='json')
                resultats['achat'] = (response.status_code, response.json())
            except Exception as erreur:
                resultats['achat'] = repr(erreur)
            finally:
                connection.close()

        with patch.object(Fournisseur, 'delete', autospec=True, side_effect=delete_avec_pause):
            thread_suppression = threading.Thread(target=supprimer)
            thread_suppression.start()
            self.assertTrue(suppression_en_pause.wait(timeout=10), resultats)

            thread_achat = threading.Thread(target=acheter)
            thread_achat.start()
            limite = time.monotonic() + 10
            achat_bloque = False
            while time.monotonic() < limite and thread_achat.is_alive():
                if pid_achat and self._attente_sur_verrou(pid_achat[0]):
                    achat_bloque = True
                    break
                time.sleep(0.01)

            liberer_suppression.set()
            thread_suppression.join(timeout=15)
            thread_achat.join(timeout=15)

        self.assertTrue(achat_bloque, f"L'achat aurait dû attendre le verrou : {resultats}")
        self.assertEqual(resultats.get('suppression'), status.HTTP_204_NO_CONTENT, resultats)
        self.assertFalse(Fournisseur.objects.filter(pk=self.fournisseur.pk).exists())

        # Même réponse qu'un fournisseur qui n'existe pas (ici : le même id,
        # désormais supprimé).
        inexistant = client().post(reverse('achats-list'), payload, format='json')
        self.assertEqual(inexistant.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resultats.get('achat'), (inexistant.status_code, inexistant.json()), resultats)

        self.assertEqual(Achat.objects.filter(boutique=self.boutique).count(), 0)
        self.produit.refresh_from_db()
        self.assertEqual(self.produit.quantite_en_stock, 0)
