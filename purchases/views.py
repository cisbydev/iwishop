from decimal import Decimal, ROUND_HALF_UP
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Prefetch
from tenants.mixins import BoutiqueScopedMixin
from notifications.services import verifier_stock_bas
from inventory.models import MouvementStock
from products.models import Produit
from accounts.permissions import RestrictedActionsForOwnerMixin
from parametres.services import formater_montant
from .models import Achat, LigneAchat, PaiementFournisseur
from .serializers import AchatSerializer, CorrectionPaiementSerializer, PaiementFournisseurSerializer
from .services.dette import corriger_paiement, enregistrer_paiement, total_paiements


def _dernier_prix_achat_valide(produit, boutique):
    # Coût courant recalculé depuis l'historique restant (LigneAchat des
    # achats encore VALIDE), jamais depuis l'achat qu'on est en train
    # d'annuler - qu'il soit ou non la source du prix actuel n'a pas
    # besoin d'être déterminé explicitement : cette requête retombe
    # naturellement sur le bon achat dans tous les cas (P1 - achat annulé
    # ne restaure plus produit.prix_achat, cf. audit).
    #
    # Tri par -achat_id (pas -achat__date_achat) : la pk d'Achat est une
    # séquence strictement monotone à la création, sans les risques de
    # précision/égalité d'un DateTimeField. Le tri secondaire -id
    # (LigneAchat) départage plusieurs lignes du même produit dans le
    # MÊME achat : ces lignes sont insérées séquentiellement dans la
    # même transaction (AchatSerializer.create()), donc la pk la plus
    # élevée est celle qui a réellement fixé produit.prix_achat en
    # dernier à la fin de cette création (chaque ligne écrase la
    # précédente en mémoire avant son save()).
    derniere_ligne = (
        LigneAchat.objects
        .filter(produit=produit, boutique=boutique, achat__statut='VALIDE')
        .order_by('-achat_id', '-id')
        .first()
    )
    if derniere_ligne is None:
        # Aucun achat valide ne justifie plus de coût pour ce produit
        # (l'achat annulé était le seul, ou tous les précédents le sont
        # aussi déjà). 0.00 n'est pas une valeur inventée : c'est un état
        # déjà légitime du schéma (Produit.prix_achat n'est pas nullable,
        # MinValueValidator(0)), et un signal explicite plutôt que de
        # laisser subsister le prix de l'achat qu'on vient d'invalider.
        return Decimal('0.00')

    # Formule et arrondi identiques à AchatSerializer.create() : on relit
    # facteur_conversion_applique figé sur CETTE ligne historique, jamais
    # unite.facteur_conversion courant (qui peut avoir changé depuis).
    return (derniere_ligne.prix_unitaire_achat / derniere_ligne.facteur_conversion_applique).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

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
    # select_related : fournisseur_nom/utilisateur_nom (serializer).
    # prefetch_related : la sérialisation imbriquée des lignes (LigneAchatSerializer,
    # produit_nom/unite_nom) ferait sinon 1 requête par achat pour ses lignes,
    # + 2 requêtes par ligne (N+1, audit point 13).
    queryset = Achat.objects.select_related('fournisseur', 'utilisateur').prefetch_related(
        Prefetch('lignes', queryset=LigneAchat.objects.select_related('produit', 'unite'))
    )
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
        # En revanche perform_create() étant surchargé, le contrôle d'accès
        # du mixin (boutique désactivée/abonnement expiré) ne s'exécute plus
        # automatiquement : il faut l'appeler nous-mêmes (faille identifiée -
        # audit complémentaire point 1, une boutique à l'abonnement expiré
        # pouvait continuer à acheter indéfiniment).
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save()

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        # get_queryset() ne bloque plus l'accès boutique désactivée/
        # abonnement expiré (lecture toujours permise) : annuler est une
        # écriture comptable, elle doit donc rester protégée explicitement,
        # pour ne pas réintroduire la faille déjà fermée (audit
        # complémentaire point 1).
        self._verifier_acces(self._boutique_effective())
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
            # Option B : seul l'argent réellement versé après la création
            # bloque l'annulation (total net des paiements, corrections
            # comprises). Un paiement corrigé à 0 n'a pas eu lieu : l'achat
            # redevient annulable. L'acompte seul ne bloque pas. Lu sous le
            # verrou de l'achat, comme dans enregistrer_paiement().
            verse = total_paiements(achat)
            if verse != 0:
                raise ValidationError(
                    f"{formater_montant(verse, achat.boutique)} ont déjà été versés au fournisseur "
                    "sur cet achat : corrigez ces paiements à 0 avant de l'annuler."
                )

            lignes = list(achat.lignes.all())

            # Verrouille tous les produits distincts de l'achat d'un coup,
            # triés par pk croissant - même protection et même convention
            # d'ordre que AchatSerializer.create() (P1 point 7 : sans ça,
            # une vente/un mouvement de stock concurrent sur le même
            # produit pourrait lire le stock d'avant cette annulation).
            produit_ids = sorted({ligne.produit_id for ligne in lignes})
            produits_par_id = {
                produit.pk: produit
                for produit in Produit.objects.select_for_update().filter(pk__in=produit_ids).order_by('pk')
            }

            # Refuser l'annulation si retirer le stock ferait passer un
            # produit sous zéro (ex. une partie de la marchandise a déjà
            # été revendue depuis) - même règle que pour une SORTIE de
            # MouvementStock.
            for ligne in lignes:
                unites_a_retirer = int(ligne.quantite * ligne.facteur_conversion_applique)
                produit = produits_par_id[ligne.produit_id]
                if produit.quantite_en_stock < unites_a_retirer:
                    raise ValidationError(
                        f"Impossible d'annuler cet achat : le stock de '{produit.nom}' "
                        f"({produit.quantite_en_stock}) est inférieur à la quantité à retirer "
                        f"({unites_a_retirer}). Une partie a probablement déjà été revendue."
                    )

            for ligne in lignes:
                unites_a_retirer = int(ligne.quantite * ligne.facteur_conversion_applique)
                produit = produits_par_id[ligne.produit_id]
                produit.quantite_en_stock -= unites_a_retirer
                produit.save()
                verifier_stock_bas(produit)
                MouvementStock.objects.create(
                    boutique=achat.boutique,
                    produit=produit,
                    type_mouvement='SORTIE',
                    quantite=unites_a_retirer,
                    motif=f"Annulation Achat #{achat.id}",
                )

            achat.statut = 'ANNULE'
            achat.save(update_fields=['statut'])

            # Restaure produit.prix_achat sur le dernier achat encore
            # VALIDE pour chaque produit touché - sans ça, le coût de
            # l'achat qu'on vient d'annuler restait figé indéfiniment sur
            # le produit et se retrouvait gravé sur les ventes futures
            # (LigneVente.prix_achat_unitaire) via VenteSerializer.create()
            # (P1 - audit complémentaire). Ne touche jamais aux
            # LigneVente déjà créées : leur coût historique reste figé
            # (correctif déjà en place, cf. sales.serializers).
            for produit_id in produit_ids:
                produit = produits_par_id[produit_id]
                produit.prix_achat = _dernier_prix_achat_valide(produit, achat.boutique)
                produit.save(update_fields=['prix_achat'])

        serializer = self.get_serializer(achat)
        return Response(serializer.data)


class PaiementFournisseurViewSet(
    BoutiqueScopedMixin,
    RestrictedActionsForOwnerMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    # Calqué sur RemboursementViewSet. Immutable : ni update ni destroy,
    # une erreur se corrige via `corriger` (ligne d'écart, append-only).
    # Pas de liste ici : l'historique passe par les fournisseurs (commit 5).
    queryset = PaiementFournisseur.objects.select_related('achat', 'enregistre_par')
    serializer_class = PaiementFournisseurSerializer
    permission_classes = [IsAuthenticated]
    # D3 : enregistrer un paiement est permis à l'employé, le corriger est
    # réservé au propriétaire.
    actions_reservees_proprietaire = ('corriger',)
    # Pas de champ `boutique` direct : l'isolation passe par l'achat payé.
    boutique_lookup = 'achat__boutique'

    def perform_create(self, serializer):
        # BoutiqueScopedMixin.perform_create ferait serializer.save(boutique=...) :
        # PaiementFournisseur n'a pas ce champ, on ne l'appelle donc pas.
        # D1 (offre unique) : abonnement valide seulement, aucun palier.
        self._verifier_acces(self._boutique_effective())
        # L'achat appartient forcément à la boutique active : le champ
        # `achat` (AchatDeLaBoutiqueField) renvoie 404 sinon.
        achat = serializer.validated_data['achat']

        # Toute la logique (verrou, bornes, recalcul de la dette) vit dans
        # le service : jamais de serializer.save() direct ici.
        serializer.instance = enregistrer_paiement(
            achat=achat,
            montant=serializer.validated_data['montant'],
            utilisateur=self.request.user,
            mode_paiement=serializer.validated_data.get('mode_paiement'),
        )

    @action(detail=True, methods=['post'])
    def corriger(self, request, pk=None):
        # Écriture comptable : mêmes contrôles d'accès que perform_create.
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        # get_object() applique le scoping boutique (boutique_lookup) : le
        # paiement d'une autre boutique renvoie 404.
        paiement = self.get_object()

        entree = CorrectionPaiementSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        correction, achat, total = corriger_paiement(
            paiement=paiement,
            nouveau_montant=entree.validated_data['nouveau_montant'],
            motif=entree.validated_data['motif'],
            utilisateur=request.user,
        )

        # État de l'achat joint à la réponse (le frontend rafraîchit son
        # affichage sans requête supplémentaire), montants en chaînes.
        montant = serializers.DecimalField(max_digits=12, decimal_places=2)
        data = PaiementFournisseurSerializer(correction).data
        data['total_paiements'] = montant.to_representation(total)
        data['montant_du'] = montant.to_representation(achat.montant_du)
        data['statut_paiement'] = achat.statut_paiement
        return Response(data, status=status.HTTP_201_CREATED)
