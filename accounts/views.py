from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User

from .serializers import (
    ChangePasswordSerializer,
    EmployeSerializer,
    EmployeCreateSerializer,
    MeSerializer,
)
from .permissions import IsOwner


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


class EmployeViewSet(viewsets.ModelViewSet):
    """
    CRUD des comptes employés, réservé exclusivement au propriétaire (superuser).
    Le propriétaire lui-même n'apparaît pas dans cette liste.
    """
    queryset = User.objects.filter(is_superuser=False).order_by('username')
    permission_classes = [IsOwner]

    def get_serializer_class(self):
        if self.action == 'create':
            return EmployeCreateSerializer
        return EmployeSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id:
            return Response(
                {"detail": "Vous ne pouvez pas supprimer votre propre compte ici."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)
