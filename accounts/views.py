from rest_framework import viewsets, status
from rest_framework.views import APIView
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


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


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
        # quelle, d'où l'appel explicite aux mêmes vérifications (faille
        # identifiée - audit complémentaire point 1, la gestion des
        # employés n'était protégée ni par `actif` ni par
        # `abonnement_valide()`).
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
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
