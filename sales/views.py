from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Min, Prefetch, Q, Sum
from django_filters.rest_framework import DjangoFilterBackend
from tenants.mixins import BoutiqueScopedMixin
from tenants.premium import verifier_acces_premium
from notifications.services import verifier_stock_bas
from inventory.models import MouvementStock
from products.models import Produit
from accounts.permissions import RestrictedActionsForOwnerMixin
from parametres.services import formater_montant
from .models import Vente, LigneVente, Client, Remboursement
from .serializers import (
    VenteSerializer, ClientSerializer, RemboursementSerializer,
    ClientAvecDetteSerializer, HistoriqueClientSerializer,
    CorrectionRemboursementSerializer,
)
from .services.credit import (
    avertissement_plafond_credit, corriger_remboursement, enregistrer_remboursement,
)

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
            # Option B, comme AchatViewSet.annuler : seul le total net des
            # remboursements (corrections comprises) bloque l'annulation. Un
            # remboursement corrigé à 0 n'a pas eu lieu : la vente redevient
            # annulable. L'acompte seul ne bloque pas. Lu sous le verrou de la
            # vente, comme dans enregistrer_remboursement().
            rembourse = vente.remboursements.aggregate(total=Sum('montant'))['total'] or 0
            if rembourse != 0:
                raise ValidationError(
                    f"{formater_montant(rembourse, vente.boutique)} de remboursements sont déjà "
                    "enregistrés sur cette vente : corrigez-les à 0 avant de l'annuler."
                )

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
            ),
            # Même filtre que dette_totale ci-dessus : sert au frontend pour
            # colorer l'alerte selon l'ancienneté de la dette la plus vieille
            # du client (V2 étape 14).
            plus_ancienne_dette=Min(
                'ventes__date_vente',
                filter=Q(ventes__montant_du__gt=0, ventes__statut='VALIDEE'),
            ),
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
    RestrictedActionsForOwnerMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    # Immutable : ni update ni destroy, une ligne de remboursement déjà
    # enregistrée n'est jamais modifiée. Une erreur se corrige via l'action
    # `corriger`, qui ajoute une ligne d'écart (append-only).
    queryset = Remboursement.objects.select_related('vente', 'enregistre_par')
    serializer_class = RemboursementSerializer
    permission_classes = [IsAuthenticated]
    # Corriger modifie une écriture comptable déjà entrée (dette du
    # client) : réservé au propriétaire, comme Vente/Achat.annuler.
    actions_reservees_proprietaire = ('corriger',)
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
            vente=vente,
            montant=serializer.validated_data['montant'],
            utilisateur=self.request.user,
            mode_paiement=serializer.validated_data.get('mode_paiement'),
        )
        serializer.instance = remboursement

    @action(detail=True, methods=['post'])
    def corriger(self, request, pk=None):
        # Écriture comptable : mêmes contrôles d'accès que perform_create.
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        verifier_acces_premium(boutique)
        # get_object() applique le scoping boutique (boutique_lookup) : le
        # remboursement d'une autre boutique renvoie 404.
        remboursement = self.get_object()

        entree = CorrectionRemboursementSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        correction, vente, total_rembourse = corriger_remboursement(
            remboursement=remboursement,
            nouveau_montant=entree.validated_data['nouveau_montant'],
            motif=entree.validated_data['motif'],
            utilisateur=request.user,
        )

        # État de la vente joint à la réponse (le frontend rafraîchit son
        # affichage sans requête supplémentaire), montants formatés comme
        # le reste de l'API (chaînes à 2 décimales).
        montant = serializers.DecimalField(max_digits=12, decimal_places=2)
        data = RemboursementSerializer(correction).data
        data['total_rembourse'] = montant.to_representation(total_rembourse)
        data['montant_du'] = montant.to_representation(vente.montant_du)
        data['statut_paiement'] = vente.statut_paiement
        return Response(data, status=status.HTTP_201_CREATED)
