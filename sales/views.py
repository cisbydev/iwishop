from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django_filters.rest_framework import DjangoFilterBackend
from tenants.mixins import BoutiqueScopedMixin
from tenants.premium import verifier_acces_premium
from notifications.services import verifier_stock_bas
from inventory.models import MouvementStock
from products.models import Produit
from accounts.permissions import RestrictedActionsForOwnerMixin
from .models import Vente, LigneVente, Client, Remboursement
from .serializers import (
    VenteSerializer, ClientSerializer, RemboursementSerializer,
    ClientAvecDetteSerializer, HistoriqueClientSerializer,
)
from .services.credit import avertissement_plafond_credit, enregistrer_remboursement

class VenteViewSet(
    BoutiqueScopedMixin,
    RestrictedActionsForOwnerMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    # Une vente validée est un document comptable : une fois créée, elle ne
    # doit plus être modifiable ni supprimable (PUT/PATCH/DELETE
    # désactivés, même principe que MouvementStock). Pour corriger une
    # erreur, on l'annule via l'action `annuler`, qui restaure le stock par
    # une écriture inverse plutôt que de réécrire ou effacer l'historique.
    # select_related : utilisateur_nom (serializer).
    # prefetch_related : la sérialisation imbriquée des lignes (LigneVenteSerializer,
    # produit_nom/unite_nom) ferait sinon 1 requête par vente pour ses lignes,
    # + 2 requêtes par ligne (N+1, audit point 13).
    queryset = Vente.objects.select_related('utilisateur').prefetch_related(
        Prefetch('lignes', queryset=LigneVente.objects.select_related('produit', 'unite'))
    )
    serializer_class = VenteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['mode_paiement', 'client', 'date_vente', 'statut']
    # Annuler reverse une écriture comptable déjà entrée (stock + rapports) :
    # réservé au propriétaire (P1 point 6 - RBAC).
    actions_reservees_proprietaire = ('annuler',)

    def perform_create(self, serializer):
        # VenteSerializer.create() résout et assigne déjà `boutique` lui-même
        # (via self.context['request']) : ne pas le repasser ici, sinon
        # Vente.objects.create(boutique=..., **validated_data) reçoit deux fois
        # le même kwarg (BoutiqueScopedMixin.perform_create l'injecterait aussi).
        # En revanche perform_create() étant surchargé, le contrôle d'accès
        # du mixin (boutique désactivée/abonnement expiré) ne s'exécute plus
        # automatiquement : il faut l'appeler nous-mêmes (faille identifiée -
        # audit complémentaire point 1, une boutique à l'abonnement expiré
        # pouvait continuer à vendre indéfiniment).
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save()

    def create(self, request, *args, **kwargs):
        # Avertissement non bloquant (plafond de crédit dépassé) : la vente
        # est déjà créée à ce stade, on ne fait qu'enrichir la réponse -
        # même principe que ApprouverDemandeView (tenants/views.py), qui
        # ajoute un champ "avertissement" à côté des données sans jamais
        # bloquer la création par une erreur.
        response = super().create(request, *args, **kwargs)
        # Court-circuite la requête supplémentaire pour l'immense majorité
        # des ventes (comptant, sans client_credit).
        if response.status_code == status.HTTP_201_CREATED and response.data.get('client_credit'):
            vente = Vente.objects.select_related('client_credit').get(pk=response.data['id'])
            avertissement = avertissement_plafond_credit(vente)
            if avertissement:
                response.data['avertissement'] = avertissement
        return response

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        # get_queryset() ne bloque plus l'accès boutique désactivée/
        # abonnement expiré (lecture toujours permise) : annuler est une
        # écriture comptable, elle doit donc rester protégée explicitement,
        # pour ne pas réintroduire la faille déjà fermée (audit
        # complémentaire point 1).
        self._verifier_acces(self._boutique_effective())
        # get_object() applique le scoping boutique (BoutiqueScopedMixin) :
        # impossible d'annuler la vente d'une autre boutique.
        vente_verifiee = self.get_object()

        with transaction.atomic():
            # Reverrouille la ligne dans la transaction pour empêcher un
            # double appel concurrent de passer la vérification de statut
            # avant que le premier n'ait committé (idempotence robuste).
            vente = Vente.objects.select_for_update().get(pk=vente_verifiee.pk)
            if vente.statut == 'ANNULEE':
                raise ValidationError("Cette vente est déjà annulée.")

            lignes = list(vente.lignes.all())

            # Verrouille tous les produits distincts de la vente d'un coup,
            # triés par pk croissant - même protection et même convention
            # d'ordre que VenteSerializer.create() (P1 point 7 : sans ça,
            # une vente/un mouvement de stock concurrent sur le même
            # produit pourrait lire le stock d'avant cette annulation).
            produit_ids = sorted({ligne.produit_id for ligne in lignes})
            produits_par_id = {
                produit.pk: produit
                for produit in Produit.objects.select_for_update().filter(pk__in=produit_ids).order_by('pk')
            }

            for ligne in lignes:
                unites_a_restaurer = int(ligne.quantite * ligne.facteur_conversion_applique)
                produit = produits_par_id[ligne.produit_id]
                produit.quantite_en_stock += unites_a_restaurer
                produit.save()
                verifier_stock_bas(produit)
                MouvementStock.objects.create(
                    boutique=vente.boutique,
                    produit=produit,
                    type_mouvement='ENTREE',
                    quantite=unites_a_restaurer,
                    motif=f"Annulation Vente #{vente.numero}",
                )

            vente.statut = 'ANNULEE'
            vente.save(update_fields=['statut'])

        serializer = self.get_serializer(vente)
        return Response(serializer.data)


class ClientViewSet(
    BoutiqueScopedMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    # Pas de suppression (données de crédit/historique client) : un client
    # à crédit reste rattaché à ses ventes/remboursements indéfiniment,
    # même principe que Vente (jamais supprimée, seulement annulée).
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # Création d'un client à crédit réservée au palier Premium - la
        # lecture (liste, historique) reste toujours autorisée, seule
        # l'écriture est bloquée (cf. tenants.premium.verifier_acces_premium).
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        verifier_acces_premium(boutique)
        serializer.save(boutique=boutique)

    @action(detail=False, methods=['get'])
    def avec_dette(self, request):
        # Sum agrégé en base (annotate), pas de boucle Python : reste
        # performant même avec beaucoup de clients. Une vente ANNULEE ne
        # compte plus dans la dette (même filtre que
        # sales.services.credit.dette_totale_client) - sans ce filtre, un
        # crédit annulé resterait compté indéfiniment.
        queryset = self.get_queryset().annotate(
            dette_totale=Sum(
                'ventes__montant_du',
                filter=Q(ventes__montant_du__gt=0, ventes__statut='VALIDEE'),
            )
        ).filter(dette_totale__gt=0).order_by('-dette_totale')

        page = self.paginate_queryset(queryset)
        serializer = ClientAvecDetteSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def historique(self, request, pk=None):
        # get_object() passe par get_queryset() (BoutiqueScopedMixin) :
        # un client d'une autre boutique renvoie 404, jamais son historique,
        # même en devinant son id.
        client = self.get_object()

        ventes = client.ventes.prefetch_related(
            Prefetch('remboursements', queryset=Remboursement.objects.select_related('enregistre_par'))
        ).order_by('-date_vente')
        serializer = HistoriqueClientSerializer(ventes, many=True)
        return Response(serializer.data)


class RemboursementViewSet(
    BoutiqueScopedMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    # Immutable : ni update ni destroy, un remboursement déjà enregistré ne
    # se corrige pas (même principe comptable que Vente/annuler).
    queryset = Remboursement.objects.select_related('vente', 'enregistre_par')
    serializer_class = RemboursementSerializer
    permission_classes = [IsAuthenticated]
    # Remboursement n'a pas de champ `boutique` direct : l'isolation passe
    # par la vente qu'il rembourse (même principe que ProduitPrixViewSet,
    # boutique_lookup = 'produit__boutique').
    boutique_lookup = 'vente__boutique'

    def perform_create(self, serializer):
        # BoutiqueScopedMixin.perform_create ferait serializer.save(boutique=...) :
        # Remboursement n'a pas ce champ, on ne l'appelle donc pas ici.
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        verifier_acces_premium(boutique)

        vente = serializer.validated_data['vente']
        if vente.boutique_id != boutique.id:
            raise PermissionDenied("Cette vente n'appartient pas à votre boutique.")

        # La logique de recalcul (dette, statut_paiement) vit uniquement
        # dans le service : jamais de serializer.save() direct ici.
        remboursement = enregistrer_remboursement(
            vente=vente, montant=serializer.validated_data['montant'], utilisateur=self.request.user
        )
        serializer.instance = remboursement
