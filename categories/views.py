from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from .images import (
    enregistrer_image_categorie, retirer_image_categorie,
    supprimer_image_categorie_apres_commit, traiter_image_categorie,
)
from .models import Categorie
from .serializers import CategorieSerializer

class CategorieViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = Categorie.objects.all()
    serializer_class = CategorieSerializer
    permission_classes = [IsAuthenticated]
    # Suppression réservée au propriétaire (P1 point 6 - RBAC).
    actions_reservees_proprietaire = ('destroy',)

    def perform_destroy(self, instance):
        image = instance.image.name
        super().perform_destroy(instance)
        # Seulement si la suppression a réussi.
        supprimer_image_categorie_apres_commit(image)

    # Tout vendeur qui peut modifier la catégorie envoie ou retire son image
    # (décision du 2026-10-23). get_object() : catégorie d'une autre
    # boutique, même 404 qu'une catégorie inexistante ; Vue Support refusée
    # (403, écriture). Action personnalisée : _verifier_acces() appelé ici
    # (voir BoutiqueScopedMixin.get_queryset).
    @action(detail=True, methods=['post', 'delete'], parser_classes=[MultiPartParser])
    def image(self, request, pk=None):
        categorie = self.get_object()
        self._verifier_acces(self._boutique_effective())

        if request.method == 'DELETE':
            categorie = retirer_image_categorie(categorie)
        else:
            fichier = request.FILES.get('image')
            if fichier is None:
                raise ValidationError("Aucune image envoyée.")
            categorie = enregistrer_image_categorie(categorie, traiter_image_categorie(fichier))

        return Response(self.get_serializer(categorie).data)