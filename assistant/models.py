from django.contrib.auth.models import User
from django.db import models


class RequeteAssistant(models.Model):
    """Trace d'audit de chaque question posée à l'assistant IA - jamais
    modifiée ni supprimée une fois créée (pas de vue update/delete exposée),
    même philosophie d'immutabilité que Vente (cf. sales.models.Vente)."""
    boutique = models.ForeignKey('tenants.Boutique', on_delete=models.CASCADE)
    # SET_NULL (pas CASCADE) : un compte supprimé ne doit jamais effacer
    # l'historique des questions posées, même principe que Vente.utilisateur.
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    question = models.TextField()
    # blank=True : une réponse vide trace un échec (erreur Anthropic,
    # timeout...) sans empêcher l'enregistrement de la requête elle-même.
    reponse = models.TextField(blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_creation']

    def __str__(self):
        return f"{self.boutique.nom} - {self.date_creation.strftime('%d/%m/%Y %H:%M')}"
