from django.db import transaction
from django.db.models import F, Min, Prefetch, Q, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from tenants.mixins import BoutiqueScopedMixin
from accounts.permissions import RestrictedActionsForOwnerMixin
from parametres.services import formater_montant
from purchases.models import PaiementFournisseur
from .models import Fournisseur
from .serializers import (
    AchatHistoriqueFournisseurSerializer, FournisseurAvecDetteSerializer, FournisseurSerializer,
)

# Dette en cours : un achat ANNULE ne compte plus, même s'il gardait un
# montant_du (même principe que les ventes à crédit, cf. ClientViewSet).
DETTE_EN_COURS = Q(achats__statut='VALIDE', achats__montant_du__gt=0)


class FournisseurViewSet(BoutiqueScopedMixin, RestrictedActionsForOwnerMixin, viewsets.ModelViewSet):
    queryset = Fournisseur.objects.all()
    serializer_class = FournisseurSerializer
    permission_classes = [IsAuthenticated]
    # Suppression réservée au propriétaire (P1 point 6 - RBAC).
    actions_reservees_proprietaire = ('destroy',)

    @action(detail=False, methods=['get'])
    def avec_dette(self, request):
        # Agrégats en base (annotate), pas de boucle Python. Les deux
        # agrégats ne joignent que les achats : aucune jointure sur les
        # paiements ne peut multiplier les lignes et gonfler la dette.
        queryset = self.get_queryset().annotate(
            dette_totale=Sum('achats__montant_du', filter=DETTE_EN_COURS),
            # Sert au frontend à colorer l'ancienneté de la plus vieille
            # dette, comme pour les clients.
            plus_ancienne_dette=Min('achats__date_achat', filter=DETTE_EN_COURS),
        ).filter(dette_totale__gt=0).order_by('-dette_totale', 'nom')

        page = self.paginate_queryset(queryset)
        serializer = FournisseurAvecDetteSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def historique(self, request, pk=None):
        # get_object() passe par get_queryset() (BoutiqueScopedMixin) : un
        # fournisseur d'une autre boutique renvoie 404, jamais son historique.
        fournisseur = self.get_object()

        # Seulement les achats créés à crédit : montant_paye reste
        # l'acompte, donc un achat soldé depuis reste reconnaissable.
        # Annulés compris, avec leur statut.
        achats = fournisseur.achats.filter(montant_paye__lt=F('montant_total')).prefetch_related(
            Prefetch(
                'paiements',
                queryset=PaiementFournisseur.objects.select_related('enregistre_par').order_by('date_paiement', 'id'),
            )
        ).order_by('-date_achat', '-id')
        return Response(AchatHistoriqueFournisseurSerializer(achats, many=True).data)

    def perform_destroy(self, instance):
        self._verifier_acces(self._boutique_effective())
        with transaction.atomic():
            # D5 : verrou AVANT de regarder la dette. Un achat en cours de
            # création pour ce fournisseur l'a verrouillé lui aussi
            # (AchatSerializer.create) : on attend sa fin, puis on voit sa
            # dette. Les clés étrangères étant vérifiées au commit, elles ne
            # suffisent pas à sérialiser les deux.
            fournisseur = Fournisseur.objects.select_for_update().get(pk=instance.pk)
            dette = fournisseur.achats.filter(statut='VALIDE', montant_du__gt=0).aggregate(
                total=Sum('montant_du')
            )['total']
            if dette:
                raise ValidationError(
                    f"Ce fournisseur a encore une dette de {formater_montant(dette, fournisseur.boutique)} : "
                    "soldez-la avant de le supprimer."
                )
            fournisseur.delete()
