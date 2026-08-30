from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from tenants.mixins import BoutiqueScopedMixin
from inventory.models import MouvementStock
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Achat
from .serializers import AchatSerializer

class AchatViewSet(
    BoutiqueScopedMixin,
    RestrictedActionsForOwnerMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    # Un achat validé est un document comptable : une fois créé, il ne doit
    # plus être modifiable ni supprimable (PUT/PATCH/DELETE désactivés,
    # même principe que Vente/MouvementStock). Pour corriger une erreur, on
    # l'annule via l'action `annuler`, qui retire le stock ajouté par une
    # écriture inverse plutôt que de réécrire ou effacer l'historique.
    queryset = Achat.objects.all()
    serializer_class = AchatSerializer
    permission_classes = [IsAuthenticated]
    # Annuler reverse une écriture comptable déjà entrée (stock + rapports) :
    # réservé au propriétaire (P1 point 6 - RBAC).
    actions_reservees_proprietaire = ('annuler',)

    def perform_create(self, serializer):
        # AchatSerializer.create() résout et assigne déjà `boutique` lui-même
        # (via self.context['request']) : ne pas le repasser ici, sinon
        # Achat.objects.create(boutique=..., **validated_data) reçoit deux fois
        # le même kwarg (BoutiqueScopedMixin.perform_create l'injecterait aussi).
        serializer.save()

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        # get_object() applique le scoping boutique (BoutiqueScopedMixin) :
        # impossible d'annuler l'achat d'une autre boutique.
        achat_verifie = self.get_object()

        with transaction.atomic():
            # Reverrouille la ligne dans la transaction pour empêcher un
            # double appel concurrent de passer la vérification de statut
            # avant que le premier n'ait committé (idempotence robuste).
            achat = Achat.objects.select_for_update().get(pk=achat_verifie.pk)
            if achat.statut == 'ANNULE':
                raise ValidationError("Cet achat est déjà annulé.")

            lignes = list(achat.lignes.select_related('produit').all())

            # Refuser l'annulation si retirer le stock ferait passer un
            # produit sous zéro (ex. une partie de la marchandise a déjà
            # été revendue depuis) - même règle que pour une SORTIE de
            # MouvementStock.
            for ligne in lignes:
                unites_a_retirer = int(ligne.quantite * ligne.facteur_conversion_applique)
                if ligne.produit.quantite_en_stock < unites_a_retirer:
                    raise ValidationError(
                        f"Impossible d'annuler cet achat : le stock de '{ligne.produit.nom}' "
                        f"({ligne.produit.quantite_en_stock}) est inférieur à la quantité à retirer "
                        f"({unites_a_retirer}). Une partie a probablement déjà été revendue."
                    )

            for ligne in lignes:
                unites_a_retirer = int(ligne.quantite * ligne.facteur_conversion_applique)
                produit = ligne.produit
                produit.quantite_en_stock -= unites_a_retirer
                produit.save()
                MouvementStock.objects.create(
                    boutique=achat.boutique,
                    produit=produit,
                    type_mouvement='SORTIE',
                    quantite=unites_a_retirer,
                    motif=f"Annulation Achat #{achat.id}",
                )

            achat.statut = 'ANNULE'
            achat.save(update_fields=['statut'])

        serializer = self.get_serializer(achat)
        return Response(serializer.data)
