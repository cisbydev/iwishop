import os
import time
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth.models import User
from django.core.cache import cache

from tenants.mixins import BoutiqueScopedMixin
from .serializers import (
    ChangePasswordSerializer,
    EmployeSerializer,
    EmployeCreateSerializer,
    MeSerializer,
)
from .serializers_auth import CustomTokenObtainPairSerializer
from .permissions import IsOwner
from .throttling import LoginIPRateThrottle, LoginUsernameRateThrottle, _ip_client


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    # Durcissement pré-lancement (P2) : aucun throttling n'existait sur cet
    # endpoint, un brute-force applicatif n'était limité par rien. Deux
    # dimensions complémentaires (cf. accounts.throttling) - ni l'une ni
    # l'autre ne touche User.is_active ni n'ajoute de compteur métier en
    # base : un attaquant ne peut donc pas bloquer le compte d'un client
    # en enchaînant volontairement de mauvais mots de passe, seul son
    # accès (IP/identifiant) est temporairement ralenti.
    throttle_classes = [LoginIPRateThrottle, LoginUsernameRateThrottle]


class DiagnosticCacheView(APIView):
    """[DEBUG-THROTTLE] Temporaire : diagnostic du throttling qui ne se
    déclenche jamais en prod (toujours 401, jamais 429) malgré des tests
    manuels répétés. Écrit une valeur dans le cache Django par défaut
    (celui utilisé par SimpleRateThrottle) puis la relit immédiatement,
    et expose le PID du process qui répond - si le PID change d'un
    appel à l'autre, ça confirme plusieurs workers Gunicorn avec des
    mémoires LocMemCache isolées (aucun CACHES configuré dans
    settings.py, donc pas de cache partagé entre processus). AllowAny
    volontaire (aucune donnée sensible exposée) pour tester sans avoir à
    regénérer un JWT à chaque appel. A retirer une fois le diagnostic
    confirmé (même principe que [DEBUG-R2], déjà utilisé sur ce projet)."""
    permission_classes = [AllowAny]

    def get(self, request):
        pid = os.getpid()
        cle = 'diagnostic_cache_throttle'
        valeur_avant = cache.get(cle)
        compteur_avant = (valeur_avant or {}).get('compteur', 0)
        nouvelle_valeur = {'pid': pid, 'timestamp': time.time(), 'compteur': compteur_avant + 1}
        cache.set(cle, nouvelle_valeur, 300)
        relue = cache.get(cle)
        return Response({
            'pid_worker_actuel': pid,
            'valeur_avant_cet_appel': valeur_avant,
            'valeur_ecrite': nouvelle_valeur,
            'valeur_relue_immediatement_apres_ecriture': relue,
            'lecture_immediate_coherente': relue == nouvelle_valeur,
        })


class DiagnosticThrottleKeysView(APIView):
    """[DEBUG-THROTTLE] Temporaire : le diagnostic cache générique
    (DiagnosticCacheView) a confirmé que le cache fonctionne bien en
    prod (PID stable, compteur qui progresse) - donc le throttling qui
    ne se déclenche jamais sur /api/token/ vient d'ailleurs. Cette vue
    calcule les clés EXACTES (même code que LoginIPRateThrottle /
    LoginUsernameRateThrottle) pour CETTE requête réelle et affiche leur
    contenu actuel dans le cache, sans jamais appeler la vraie vue de
    login - pour voir si ces clés précises restent stables et
    progressent d'un appel /api/token/ à l'autre. Utilisation :
    GET .../diagnostic-throttle/?username=<le username testé sur
    /api/token/>, appelé avant/après une série de tentatives de login.
    AllowAny volontaire, aucune donnée sensible exposée (le username
    passé en clair n'est que celui déjà utilisé pour tester le login).
    A retirer avec DiagnosticCacheView une fois le diagnostic confirmé."""
    permission_classes = [AllowAny]

    def get(self, request):
        ip = _ip_client(request)
        cle_ip = (
            LoginIPRateThrottle.cache_format % {'scope': 'login_ip', 'ident': ip}
            if ip else None
        )
        valeur_ip = cache.get(cle_ip) if cle_ip else None

        username = request.GET.get('username', '')
        username_normalise = username.strip().lower()
        cle_username = None
        valeur_username = None
        if username_normalise:
            import hashlib
            hash_username = hashlib.sha256(username_normalise.encode('utf-8')).hexdigest()
            cle_username = LoginUsernameRateThrottle.cache_format % {
                'scope': 'login_username', 'ident': hash_username,
            }
            valeur_username = cache.get(cle_username)

        return Response({
            'x_forwarded_for_brut': request.META.get('HTTP_X_FORWARDED_FOR'),
            'remote_addr_brut': request.META.get('REMOTE_ADDR'),
            'ip_detectee_par_le_throttle': ip,
            'cle_cache_ip': cle_ip,
            'valeur_cache_ip': valeur_ip,
            'nb_entrees_ip': len(valeur_ip) if valeur_ip else 0,
            'username_teste': username or None,
            'cle_cache_username': cle_username,
            'valeur_cache_username': valeur_username,
            'nb_entrees_username': len(valeur_username) if valeur_username else 0,
        })


class MeView(APIView):
    """Renvoie les informations de l'utilisateur actuellement connecté (utile pour
    savoir côté frontend s'il faut afficher l'onglet 'Employés')."""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = MeSerializer(request.user)
        return Response(serializer.data)


class ChangePasswordView(APIView):
    """Permet à n'importe quel utilisateur connecté de changer son propre mot de passe."""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Mot de passe modifié avec succès."}, status=status.HTTP_200_OK)


class EmployeViewSet(BoutiqueScopedMixin, viewsets.ModelViewSet):
    """
    CRUD des comptes employés, réservé exclusivement au propriétaire de la boutique.
    Le propriétaire lui-même n'apparaît pas dans cette liste.

    La suppression (DELETE) désactive le compte (is_active=False) au lieu
    de le supprimer réellement (P2 point 16) : un compte employé réellement
    supprimé casserait rétroactivement la traçabilité déjà en place
    (Vente.utilisateur, Achat.utilisateur, MouvementStock.utilisateur,
    Depense.utilisateur passeraient tous à NULL). Un compte désactivé ne
    peut plus s'authentifier (SimpleJWT rejette is_active=False, y compris
    sur un access token déjà émis), donc l'effet de sécurité est identique
    à une suppression - seule la donnée historique est préservée.
    """
    permission_classes = [IsOwner]

    def get_queryset(self):
        # get_queryset() est surchargé (le modèle est User, scopé via
        # profil__boutique, et filtré en plus sur est_proprietaire=False) :
        # le filtrage générique du mixin ne s'applique donc pas telle
        # quelle. _verifier_acces() (boutique désactivée/abonnement expiré)
        # n'est PAS appelée ici : lister ses employés reste une lecture,
        # qui doit rester possible boutique désactivée/abonnement expiré -
        # seules les écritures (create/destroy/reactiver) sont bloquées,
        # via un appel explicite à chacune (cf.
        # tenants.mixins.BoutiqueScopedMixin.get_queryset()).
        boutique = self._boutique_effective()
        return User.objects.filter(
            profil__boutique=boutique,
            profil__est_proprietaire=False
        ).order_by('username')

    def perform_create(self, serializer):
        # EmployeCreateSerializer.create() résout et assigne déjà la
        # boutique lui-même (via self.context['request']) en créant le
        # Profil associé : ne pas la repasser ici, le modèle User n'a de
        # toute façon pas de champ `boutique` (le perform_create() par
        # défaut du mixin échouerait avec serializer.save(boutique=...)).
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save()

    def get_serializer_class(self):
        if self.action == 'create':
            return EmployeCreateSerializer
        return EmployeSerializer

    def destroy(self, request, *args, **kwargs):
        # get_queryset() ne bloque plus l'accès boutique désactivée/
        # abonnement expiré (lecture toujours permise) : la désactivation
        # d'un compte est une écriture, elle doit donc rester protégée
        # explicitement, pour ne pas réintroduire la faille déjà fermée
        # (audit complémentaire point 1).
        self._verifier_acces(self._boutique_effective())
        instance = self.get_object()
        if instance.id == request.user.id:
            return Response(
                {"detail": "Vous ne pouvez pas désactiver votre propre compte ici."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not instance.is_active:
            return Response(
                {"detail": "Ce compte est déjà désactivé."},
                status=status.HTTP_400_BAD_REQUEST
            )
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reactiver(self, request, pk=None):
        # get_queryset() ne bloque plus l'accès boutique désactivée/
        # abonnement expiré (lecture toujours permise) : la réactivation
        # est une écriture, elle doit donc rester protégée explicitement,
        # pour ne pas réintroduire la faille déjà fermée (audit
        # complémentaire point 1).
        self._verifier_acces(self._boutique_effective())
        # get_object() applique déjà le scoping boutique + est_proprietaire=False
        # (get_queryset() ci-dessus) : impossible de réactiver l'employé
        # d'une autre boutique (404) ou un compte propriétaire.
        instance = self.get_object()
        if instance.is_active:
            return Response(
                {"detail": "Ce compte est déjà actif."},
                status=status.HTTP_400_BAD_REQUEST
            )
        instance.is_active = True
        instance.save(update_fields=['is_active'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
