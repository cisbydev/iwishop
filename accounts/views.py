from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.exceptions import AuthenticationFailed, TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User

from tenants.mixins import BoutiqueScopedMixin
from .serializers import (
    ChangePasswordSerializer,
    EmployeSerializer,
    EmployeCreateSerializer,
    MeSerializer,
)
from .serializers_auth import CustomTokenObtainPairSerializer
from .permissions import IsOwner
from .throttling import LoginIPRateThrottle, LoginUsernameRateThrottle


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

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop('refresh', None)
        if refresh:
            _set_refresh_cookie(response, refresh)
            # The refresh is HttpOnly. Only the CSRF token is readable by Axios.
            get_token(request)
        return response


def _set_refresh_cookie(response, refresh):
    response.set_cookie(
        key=settings.JWT_REFRESH_COOKIE_NAME,
        value=str(refresh),
        max_age=settings.JWT_REFRESH_COOKIE_MAX_AGE,
        secure=settings.JWT_REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_REFRESH_COOKIE_SAMESITE,
        domain=settings.JWT_REFRESH_COOKIE_DOMAIN,
        path=settings.JWT_REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response):
    response.delete_cookie(
        key=settings.JWT_REFRESH_COOKIE_NAME,
        path=settings.JWT_REFRESH_COOKIE_PATH,
        domain=settings.JWT_REFRESH_COOKIE_DOMAIN,
        samesite=settings.JWT_REFRESH_COOKIE_SAMESITE,
    )


def _user_from_refresh(refresh):
    """Apply is_active without changing the existing boutique policy.

    A disabled boutique blocks a new login, but existing sessions keep their
    current read/write behavior, which is enforced by the tenant mixins.
    """
    user_model = get_user_model()
    try:
        user_id = refresh[api_settings.USER_ID_CLAIM]
        return user_model._default_manager.get(
            **{api_settings.USER_ID_FIELD: user_id}
        )
    except (KeyError, user_model.DoesNotExist):
        raise AuthenticationFailed('Refresh token invalide.')


@method_decorator(csrf_protect, name='dispatch')
class CookieTokenRefreshView(APIView):
    """Refresh the access token from the HttpOnly refresh cookie only."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if not raw_refresh:
            raise AuthenticationFailed('Refresh token absent.')

        try:
            refresh = RefreshToken(raw_refresh)
        except TokenError:
            raise AuthenticationFailed('Refresh token invalide.')

        user = _user_from_refresh(refresh)
        if not user.is_active:
            raise AuthenticationFailed('Ce compte est desactive.')

        response = Response({'access': str(refresh.access_token)}, status=status.HTTP_200_OK)

        # Rotation is enabled in SIMPLE_JWT. Locking the outstanding token
        # prevents two concurrent refreshes from replacing the same cookie.
        if api_settings.ROTATE_REFRESH_TOKENS:
            try:
                from rest_framework_simplejwt.token_blacklist.models import (
                    BlacklistedToken,
                    OutstandingToken,
                )
                with transaction.atomic():
                    outstanding = OutstandingToken.objects.select_for_update().get(
                        jti=refresh[api_settings.JTI_CLAIM]
                    )
                    if BlacklistedToken.objects.filter(token=outstanding).exists():
                        raise TokenError('Token is blacklisted')
                    if api_settings.BLACKLIST_AFTER_ROTATION:
                        refresh.blacklist()
                    refresh.set_jti()
                    refresh.set_exp()
                    refresh.set_iat()
            except (OutstandingToken.DoesNotExist, TokenError):
                raise AuthenticationFailed('Refresh token invalide.')

            _set_refresh_cookie(response, refresh)

        return response


@method_decorator(csrf_protect, name='dispatch')
class LogoutView(APIView):
    """Blacklist the current refresh when possible, then clear its cookie."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                # Expired, invalid and already-blacklisted cookies are all safe
                # to clear. This keeps logout idempotent.
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfTokenView(APIView):
    """Initialize the CSRF cookie for cross-origin frontend bootstrap."""

    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({'detail': 'CSRF cookie set.'})


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
