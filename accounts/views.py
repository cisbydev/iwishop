from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
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
