import json

import anthropic
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsOwner
from parametres.models import ParametresBoutique
from tenants.mixins import BoutiqueScopedMixin
from .models import RequeteAssistant
from .tools import OUTILS_PAR_NOM, SCHEMAS_OUTILS

MODELE_ANTHROPIC = "claude-haiku-4-5-20251001"
# Borne de sécurité anti-boucle infinie si le modèle enchaîne les appels
# d'outils sans jamais conclure - un échange normal (question -> 1 ou 2
# outils -> réponse) tient largement dans cette limite.
MAX_ETAPES_OUTILS = 5


class AssistantView(BoutiqueScopedMixin, APIView):
    # Réservé au propriétaire (P1 point 6, RBAC) : chaque appel a un coût
    # réel (API Anthropic facturée au token), même principe que les exports
    # PDF/Excel des rapports.
    permission_classes = [IsAuthenticated, IsOwner]

    def post(self, request, *args, **kwargs):
        boutique = self._boutique_effective()

        question = (request.data.get('question') or '').strip()
        if not question:
            return Response(
                {"detail": "La question ne peut pas être vide."}, status=status.HTTP_400_BAD_REQUEST
            )

        parametres, _ = ParametresBoutique.objects.get_or_create(boutique=boutique)
        nombre_questions_aujourdhui = RequeteAssistant.objects.filter(
            boutique=boutique, date_creation__date=timezone.localdate(),
        ).count()
        if nombre_questions_aujourdhui >= parametres.limite_questions_assistant_par_jour:
            # Refus AVANT tout appel Anthropic : le quota protège la
            # boutique d'une facture imprévue, pas seulement l'API elle-même.
            return Response(
                {"detail": "Limite quotidienne de questions à l'assistant atteinte. Réessayez demain."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if not settings.ANTHROPIC_API_KEY:
            return Response(
                {"detail": "L'assistant IA n'est pas configuré sur ce serveur."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            reponse_texte = self._interroger_assistant(boutique, question)
        except Exception:
            RequeteAssistant.objects.create(
                boutique=boutique, utilisateur=request.user, question=question, reponse='',
            )
            return Response(
                {"detail": "L'assistant IA n'a pas pu répondre pour le moment. Réessayez plus tard."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        RequeteAssistant.objects.create(
            boutique=boutique, utilisateur=request.user, question=question, reponse=reponse_texte,
        )
        return Response({"reponse": reponse_texte})

    def _interroger_assistant(self, boutique, question):
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        system_prompt = (
            f"Tu es l'assistant IA d'iwiShop pour la boutique \"{boutique.nom}\" UNIQUEMENT. "
            "Tu n'as accès qu'aux données de cette boutique précise, jamais à celles d'une autre. "
            "Utilise toujours les outils fournis pour obtenir les données réelles avant de répondre : "
            "ne réponds jamais avec des chiffres inventés ou estimés. Si les outils ne suffisent pas "
            "à répondre à la question, dis-le clairement plutôt que de deviner."
        )
        messages = [{"role": "user", "content": question}]

        for _ in range(MAX_ETAPES_OUTILS):
            completion = client.messages.create(
                model=MODELE_ANTHROPIC,
                max_tokens=1024,
                system=system_prompt,
                tools=SCHEMAS_OUTILS,
                messages=messages,
            )
            messages.append({"role": "assistant", "content": completion.content})

            if completion.stop_reason != "tool_use":
                return "".join(
                    bloc.text for bloc in completion.content if getattr(bloc, "type", None) == "text"
                )

            resultats_outils = [
                self._executer_outil(boutique, bloc)
                for bloc in completion.content
                if getattr(bloc, "type", None) == "tool_use"
            ]
            messages.append({"role": "user", "content": resultats_outils})

        return "Désolé, je n'ai pas pu répondre à votre question (trop d'étapes intermédiaires)."

    def _executer_outil(self, boutique, bloc):
        fonction = OUTILS_PAR_NOM.get(bloc.name)
        if fonction is None:
            contenu = json.dumps({"erreur": f"Outil inconnu : {bloc.name}"})
        else:
            # `boutique` est TOUJOURS injecté ici, jamais lu depuis
            # bloc.input (contrôlé par le modèle, donc indirectement par le
            # prompt utilisateur) - une clé "boutique" qui s'y trouverait
            # malgré tout (halluciné ou injecté) est explicitement ignorée.
            # Seule garantie contre une fuite cross-tenant.
            entrees_modele = {cle: valeur for cle, valeur in (bloc.input or {}).items() if cle != 'boutique'}
            contenu = json.dumps(fonction(boutique=boutique, **entrees_modele), default=str)
        return {"type": "tool_result", "tool_use_id": bloc.id, "content": contenu}
