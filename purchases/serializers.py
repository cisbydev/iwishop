from decimal import Decimal, ROUND_HALF_UP
from rest_framework import serializers
from .models import Achat, LigneAchat
from inventory.models import MouvementStock
from products.models import Produit, UniteVente
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from tenants.profil import boutique_de
from notifications.services import verifier_stock_bas
from sales.models import StatutPaiement, Vente

class LigneAchatSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')
    unite_nom = serializers.ReadOnlyField(source='unite.nom')
    # Optionnel : si absent, repli sur l'unité système "Unité" de la
    # boutique (chemin historique, quantite exprimée directement en
    # unités de stock). Si présent, permet d'acheter en unité
    # personnalisée (Sac 25kg...), comme pour les ventes (Phase 4A/4B).
    unite = serializers.PrimaryKeyRelatedField(queryset=UniteVente.objects.all(), required=False)

    class Meta:
        model = LigneAchat
        fields = ['id', 'produit', 'produit_nom', 'quantite', 'unite', 'unite_nom', 'prix_unitaire_achat', 'sous_total']
        read_only_fields = ['sous_total']

    def validate_quantite(self, value):
        # Une quantité négative inverserait le sens de l'opération : au
        # lieu d'ajouter du stock, l'achat en retirerait (faille identifiée
        # - audit complémentaire point 2). Zéro n'a pas de sens non plus
        # pour une ligne d'achat.
        if value <= 0:
            raise serializers.ValidationError("La quantité doit être strictement positive.")
        return value

class AchatSerializer(serializers.ModelSerializer):
    lignes = LigneAchatSerializer(many=True)
    fournisseur_nom = serializers.ReadOnlyField(source='fournisseur.nom')
    utilisateur_nom = serializers.ReadOnlyField(source='utilisateur.username')
    # Achat à crédit : absent => achat comptant, comportement historique
    # inchangé (un frontend encore en cache ne l'envoie pas). Fourni =>
    # argent versé au fournisseur à la création (acompte), entre 0 et
    # montant_total. statut_paiement et montant_du en découlent, calculés
    # dans create(), jamais soumis.
    montant_paye = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False
    )
    # Optionnel côté API (null = "non précisé", même principe que
    # Remboursement.mode_paiement), obligatoire dans le formulaire.
    mode_paiement = serializers.ChoiceField(
        choices=Vente.MODES_PAIEMENT, required=False, allow_null=True
    )

    class Meta:
        model = Achat
        fields = [
            'id', 'fournisseur', 'fournisseur_nom', 'date_achat', 'montant_total', 'notes',
            'statut', 'utilisateur', 'utilisateur_nom', 'lignes',
            'montant_paye', 'mode_paiement', 'statut_paiement', 'montant_du',
        ]
        read_only_fields = [
            'montant_total', 'date_achat', 'statut', 'utilisateur', 'statut_paiement', 'montant_du',
        ]

    def validate_fournisseur(self, value):
        # Ne jamais supposer qu'un fournisseur soumis appartient à la
        # boutique de l'appelant (même faille que MouvementStock.produit -
        # ici non couverte par les vérifications produit/unite de create(),
        # et absente côté update() puisque non surchargé).
        if value is None:
            return value
        boutique = boutique_de(self.context['request'])
        if value.boutique_id != boutique.id:
            raise ValidationError("Ce fournisseur n'appartient pas à votre boutique.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        boutique = boutique_de(self.context['request'])
        if not boutique.actif:
            raise serializers.ValidationError("Cette boutique a été désactivée.")

        lignes_data = validated_data.pop('lignes')
        montant_paye_soumis = validated_data.pop('montant_paye', None)
        # montant_paye provisoire : le total n'est connu qu'après les lignes
        # (même transaction, jamais visible à 0 de l'extérieur).
        achat = Achat.objects.create(
            boutique=boutique, utilisateur=self.context['request'].user,
            montant_paye=0, **validated_data
        )

        montant_total = 0
        # Un même achat peut contenir plusieurs lignes pour le même
        # produit (ex: 1 Sac 25kg + 3 Kg du même article) : on réutilise la
        # même instance pour un produit donné afin que les ajouts
        # s'accumulent correctement en mémoire avant chaque save() (même
        # bug que celui corrigé côté ventes en Phase 4A/4B).
        #
        # Ces instances sont verrouillées via select_for_update(), triées
        # par pk croissant, AVANT toute lecture de quantite_en_stock -
        # sinon deux ventes/achats concurrents sur le même produit
        # liraient tous les deux le stock d'avant-transaction et
        # pourraient survendre (race condition, P1 point 7). L'ordre
        # croissant est la même convention appliquée à tous les points de
        # mutation du stock (Vente/Achat create+annuler, MouvementStock),
        # pour ne jamais provoquer de deadlock entre verrous croisés.
        produit_ids = sorted({ligne_data['produit'].pk for ligne_data in lignes_data})
        produits_par_id = {
            produit.pk: produit
            for produit in Produit.objects.select_for_update().filter(pk__in=produit_ids).order_by('pk')
        }

        for ligne_data in lignes_data:
            produit = produits_par_id[ligne_data['produit'].pk]
            quantite = ligne_data['quantite']
            prix = ligne_data['prix_unitaire_achat']
            unite_soumise = ligne_data.pop('unite', None)

            # Vérification explicite d'appartenance - ne jamais supposer
            # qu'un produit ou une unité soumis appartiennent à la
            # boutique de l'appelant (même faille trouvée et corrigée en
            # Phase 4A pour ProduitPrixViewSet, jamais auditée côté achats
            # jusqu'ici).
            if produit.boutique_id != boutique.id:
                raise ValidationError(f"Le produit '{produit.nom}' n'appartient pas à votre boutique.")

            if unite_soumise is not None:
                if unite_soumise.boutique_id != boutique.id:
                    raise ValidationError("L'unité sélectionnée n'appartient pas à votre boutique.")
                unite = unite_soumise
            else:
                # Chemin historique inchangé : les achats saisis sans
                # unité explicite sont comptés directement en unités de
                # stock, comme avant cette phase.
                try:
                    unite = UniteVente.objects.get(boutique=boutique, nom='Unité')
                except UniteVente.DoesNotExist:
                    raise ValidationError(
                        "Aucune unité 'Unité' n'est configurée pour votre boutique. "
                        "Contactez le support."
                    )

            # Calculer le nombre d'unités réelles à ajouter au stock, via
            # le facteur de conversion centralisé sur l'unité de vente.
            unites_reelles = quantite * unite.facteur_conversion
            if unites_reelles != unites_reelles.to_integral_value():
                raise ValidationError(
                    f"'{produit.nom}' ne peut pas être acheté en quantité fractionnaire "
                    f"avec l'unité '{unite.nom}' pour le moment. Utilisez une quantité entière."
                )
            unites_a_ajouter = int(unites_reelles)

            # Le facteur de conversion est figé sur la ligne au moment de
            # l'achat (comme facteur_conversion_applique côté ventes) :
            # l'historique ne doit jamais être recalculé en direct depuis
            # UniteVente, qui peut être modifiée après coup.
            ligne_data['unite'] = unite
            ligne_data['facteur_conversion_applique'] = unite.facteur_conversion

            # Créer la ligne d'achat
            ligne = LigneAchat.objects.create(achat=achat, boutique=boutique, **ligne_data)
            montant_total += ligne.sous_total

            # Mettre à jour le stock du produit (en unités de stock réelles)
            produit.quantite_en_stock += unites_a_ajouter

            # Le prix d'achat du produit reflète désormais le dernier prix
            # réellement payé au fournisseur, ramené à l'unité de stock
            # (ex: 20000 FCFA le Sac 25kg -> 800 FCFA/unité de stock). Ce
            # champ représente le COÛT ACTUEL du produit, utilisé pour les
            # prochaines ventes (sales.serializers.VenteSerializer.create()
            # le fige alors sur LigneVente.prix_achat_unitaire) - il n'est
            # plus jamais relu pour recalculer le bénéfice d'une vente déjà
            # réalisée (bug P1 corrigé, coût historique désormais porté par
            # la ligne de vente elle-même, pas par le produit).
            produit.prix_achat = (prix / unite.facteur_conversion).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

            produit.save()
            verifier_stock_bas(produit)

            # Enregistrer le mouvement de stock correspondant
            MouvementStock.objects.create(
                boutique=boutique,
                produit=produit,
                type_mouvement='ENTREE',
                quantite=unites_a_ajouter,
                motif=f"Achat fournisseur #{achat.id}"
            )

        achat.montant_total = montant_total
        self._appliquer_paiement(achat, montant_paye_soumis, boutique)
        achat.save()
        return achat

    def _appliquer_paiement(self, achat, montant_paye_soumis, boutique):
        # Sans montant_paye soumis : achat comptant, tout est versé.
        if montant_paye_soumis is None:
            achat.montant_paye = achat.montant_total
        elif montant_paye_soumis > achat.montant_total:
            raise ValidationError(
                "Le montant payé ne peut pas dépasser le montant total de l'achat."
            )
        else:
            achat.montant_paye = montant_paye_soumis

        achat.montant_du = achat.montant_total - achat.montant_paye
        if achat.montant_du == 0:
            achat.statut_paiement = StatutPaiement.PAYE
            return

        # Achat à crédit. Les erreurs ci-dessous annulent toute la création
        # (lignes, stock, mouvements) : create() est atomique.
        # D3 : réservé au propriétaire de la boutique active en v1 (même
        # règle que IsOwner, qui ne s'applique qu'à une action entière).
        user = self.context['request'].user
        if not user.profils.filter(boutique=boutique, est_proprietaire=True).exists():
            raise PermissionDenied(
                "Seul le propriétaire de la boutique peut enregistrer un achat à crédit."
            )
        if achat.fournisseur_id is None:
            raise ValidationError("Un achat à crédit doit avoir un fournisseur.")

        if achat.montant_paye == 0:
            # Demande contradictoire : refusée, jamais corrigée en silence.
            if achat.mode_paiement is not None:
                raise ValidationError(
                    "Aucun montant n'est versé sur cet achat : il ne peut pas avoir "
                    "de mode de paiement."
                )
            achat.statut_paiement = StatutPaiement.EN_ATTENTE
        else:
            achat.statut_paiement = StatutPaiement.PARTIEL
