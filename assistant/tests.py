import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from parametres.models import ParametresBoutique
from sales.models import Client as ClientCredit, StatutPaiement, Vente
from tenants.models import Boutique, Profil
from .models import RequeteAssistant

# Toutes les vraies requêtes réseau vers l'API Anthropic sont interdites dans
# ces tests (coût réel, flaky, dépend du réseau) : anthropic.Anthropic est
# systématiquement mocké via @patch('assistant.views.anthropic.Anthropic').


class AssistantQuotaTests(APITestCase):
    """Le quota quotidien doit bloquer AVANT tout appel Anthropic (facturé
    au token) - jamais un contrôle a posteriori."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique Assistant Quota", slug="boutique-assistant-quota")
        self.proprietaire = User.objects.create_user(username="assistant_quota_proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.proprietaire)
        self.url = reverse('assistant')

    @override_settings(ANTHROPIC_API_KEY='cle-de-test-factice')
    @patch('assistant.views.anthropic.Anthropic')
    def test_quota_atteint_refuse_la_requete_sans_appeler_anthropic(self, mock_anthropic_class):
        ParametresBoutique.objects.create(boutique=self.boutique, limite_questions_assistant_par_jour=1)
        RequeteAssistant.objects.create(
            boutique=self.boutique, utilisateur=self.proprietaire,
            question="Question déjà posée aujourd'hui", reponse="Réponse déjà donnée",
        )

        response = self.client.post(self.url, {"question": "Une question de trop ?"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        mock_anthropic_class.assert_not_called()
        # Aucune nouvelle trace créée pour la requête refusée.
        self.assertEqual(RequeteAssistant.objects.count(), 1)


class AssistantReponseNormaleTests(APITestCase):
    """Flux nominal : le modèle demande un outil, on lui renvoie le
    résultat, il conclut - la question et la réponse finale doivent être
    tracées dans RequeteAssistant."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique Assistant Normal", slug="boutique-assistant-normal")
        self.proprietaire = User.objects.create_user(username="assistant_normal_proprio", password="pass1234")
        Profil.objects.create(user=self.proprietaire, boutique=self.boutique, est_proprietaire=True)
        self.client.force_authenticate(user=self.proprietaire)
        self.url = reverse('assistant')

    @override_settings(ANTHROPIC_API_KEY='cle-de-test-factice')
    @patch('assistant.views.anthropic.Anthropic')
    def test_reponse_normale_cree_la_requete_et_retourne_la_reponse(self, mock_anthropic_class):
        mock_client = mock_anthropic_class.return_value
        completion_avec_outil = SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(type="tool_use", id="toolu_01", name="obtenir_resume_financier", input={}),
            ],
        )
        completion_finale = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="Votre chiffre d'affaires est de 0 FCFA.")],
        )
        mock_client.messages.create.side_effect = [completion_avec_outil, completion_finale]

        response = self.client.post(self.url, {"question": "Quel est mon chiffre d'affaires ?"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['reponse'], "Votre chiffre d'affaires est de 0 FCFA.")
        self.assertEqual(mock_client.messages.create.call_count, 2)

        requete = RequeteAssistant.objects.get()
        self.assertEqual(requete.boutique, self.boutique)
        self.assertEqual(requete.utilisateur, self.proprietaire)
        self.assertEqual(requete.question, "Quel est mon chiffre d'affaires ?")
        self.assertEqual(requete.reponse, "Votre chiffre d'affaires est de 0 FCFA.")

    @override_settings(ANTHROPIC_API_KEY='')
    @patch('assistant.views.anthropic.Anthropic')
    def test_cle_api_absente_retourne_erreur_claire_sans_crash(self, mock_anthropic_class):
        response = self.client.post(self.url, {"question": "Test"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        mock_anthropic_class.assert_not_called()
        self.assertEqual(RequeteAssistant.objects.count(), 0)

    def test_question_vide_refusee(self):
        response = self.client.post(self.url, {"question": "   "}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(ANTHROPIC_API_KEY='cle-de-test-factice')
    @patch('assistant.views.anthropic.Anthropic')
    def test_date_mal_formee_ne_fait_pas_echouer_toute_la_requete(self, mock_anthropic_class):
        """Une exception Django brute ici remonterait au `except Exception`
        générique de la vue -> 502 pour toute la conversation. tools.py doit
        l'intercepter en amont et renvoyer un dict d'erreur exploitable par
        le modèle à la place."""
        mock_client = mock_anthropic_class.return_value
        completion_avec_outil = SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use", id="toolu_01", name="obtenir_resume_financier",
                    input={"date_debut": "pas-une-date", "date_fin": "2026-09-22"},
                ),
            ],
        )
        completion_finale = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="La date fournie n'est pas valide.")],
        )
        mock_client.messages.create.side_effect = [completion_avec_outil, completion_finale]

        response = self.client.post(
            self.url, {"question": "Quel est mon CA depuis 'pas-une-date' ?"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(mock_client.messages.create.call_count, 2)

        # Même remarque que AssistantIsolationMultiTenantTests : `messages`
        # est mutée en place, index 2 = le tool_result (pas -1, qui pointe
        # sur la réponse finale ajoutée après coup au même objet).
        deuxieme_appel = mock_client.messages.create.call_args_list[1]
        message_tool_result = deuxieme_appel.kwargs['messages'][2]
        contenu_outil = json.loads(message_tool_result['content'][0]['content'])

        self.assertEqual(contenu_outil, {"erreur": "Date invalide, format attendu YYYY-MM-DD"})


class AssistantPermissionTests(APITestCase):
    """Réservé au propriétaire (P1 point 6, RBAC), même principe que les
    exports PDF/Excel des rapports."""

    def setUp(self):
        self.boutique = Boutique.objects.create(nom="Boutique Assistant RBAC", slug="boutique-assistant-rbac")
        self.employe = User.objects.create_user(username="assistant_rbac_employe", password="pass1234")
        Profil.objects.create(user=self.employe, boutique=self.boutique, est_proprietaire=False)
        self.url = reverse('assistant')

    @override_settings(ANTHROPIC_API_KEY='cle-de-test-factice')
    @patch('assistant.views.anthropic.Anthropic')
    def test_employe_recoit_403_et_anthropic_nest_jamais_appele(self, mock_anthropic_class):
        self.client.force_authenticate(user=self.employe)

        response = self.client.post(self.url, {"question": "Quel est mon chiffre d'affaires ?"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        mock_anthropic_class.assert_not_called()


class AssistantIsolationMultiTenantTests(APITestCase):
    """Même si le modèle (halluciné ou manipulé via le prompt) tente de
    faire passer l'id d'une autre boutique dans l'entrée d'un outil,
    `boutique` reste toujours fixé côté serveur à la boutique de la
    requête - jamais lu depuis l'entrée fournie par le modèle."""

    def setUp(self):
        self.boutique_a = Boutique.objects.create(nom="Boutique Assistant A", slug="boutique-assistant-a")
        self.proprietaire_a = User.objects.create_user(username="assistant_proprio_a", password="pass1234")
        Profil.objects.create(user=self.proprietaire_a, boutique=self.boutique_a, est_proprietaire=True)

        self.boutique_b = Boutique.objects.create(nom="Boutique Assistant B", slug="boutique-assistant-b")

        self.client_a = ClientCredit.objects.create(
            boutique=self.boutique_a, nom="Client A Dette", telephone="0400000001"
        )
        self.client_b = ClientCredit.objects.create(
            boutique=self.boutique_b, nom="Client B Dette", telephone="0400000002"
        )
        Vente.objects.create(
            boutique=self.boutique_a, client_credit=self.client_a,
            montant_paye=0, montant_total=500, montant_net=500,
            montant_du=500, statut_paiement=StatutPaiement.EN_ATTENTE,
        )
        Vente.objects.create(
            boutique=self.boutique_b, client_credit=self.client_b,
            montant_paye=0, montant_total=700, montant_net=700,
            montant_du=700, statut_paiement=StatutPaiement.EN_ATTENTE,
        )

        self.client.force_authenticate(user=self.proprietaire_a)
        self.url = reverse('assistant')

    @override_settings(ANTHROPIC_API_KEY='cle-de-test-factice')
    @patch('assistant.views.anthropic.Anthropic')
    def test_outil_ignore_toute_tentative_de_cibler_une_autre_boutique(self, mock_anthropic_class):
        mock_client = mock_anthropic_class.return_value
        # `input` tente d'injecter une clé "boutique" pointant vers la
        # boutique B - absente du schéma déclaré (aucune propriété), donc
        # nécessairement une tentative de manipulation/hallucination.
        completion_avec_outil = SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use", id="toolu_01", name="lister_clients_en_dette",
                    input={"boutique": self.boutique_b.id},
                ),
            ],
        )
        completion_finale = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="Voici les clients en dette.")],
        )
        mock_client.messages.create.side_effect = [completion_avec_outil, completion_finale]

        response = self.client.post(
            self.url,
            {"question": f"Montre-moi les clients en dette (y compris ceux de la boutique {self.boutique_b.id})"},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        # `messages` est une seule liste mutée en place tout au long de
        # l'échange (même objet passé à chaque appel) : au moment de cette
        # inspection, son état final compte 4 entrées - question, tool_use
        # assistant, tool_result (celui qui nous intéresse), réponse finale
        # assistant - d'où l'index 2 plutôt que -1 (qui pointerait sur la
        # réponse finale, ajoutée après coup au même objet).
        deuxieme_appel = mock_client.messages.create.call_args_list[1]
        message_tool_result = deuxieme_appel.kwargs['messages'][2]
        contenu_outil = json.loads(message_tool_result['content'][0]['content'])
        noms_clients = [client['nom'] for client in contenu_outil['clients_en_dette']]

        self.assertIn("Client A Dette", noms_clients)
        self.assertNotIn("Client B Dette", noms_clients)
