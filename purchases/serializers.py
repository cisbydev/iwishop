from decimal import Decimal, ROUND_HALF_UP
from rest_framework import serializers
from .models import Achat, LigneAchat
from inventory.models import MouvementStock
from products.models import UniteVente
from rest_framework.exceptions import ValidationError
from django.db import transaction

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

class AchatSerializer(serializers.ModelSerializer):
    lignes = LigneAchatSerializer(many=True)
    fournisseur_nom = serializers.ReadOnlyField(source='fournisseur.nom')

    class Meta:
        model = Achat
        fields = ['id', 'fournisseur', 'fournisseur_nom', 'date_achat', 'montant_total', 'notes', 'statut', 'lignes']
        read_only_fields = ['montant_total', 'date_achat', 'statut']

    def validate_fournisseur(self, value):
        # Ne jamais supposer qu'un fournisseur soumis appartient à la
        # boutique de l'appelant (même faille que MouvementStock.produit -
        # ici non couverte par les vérifications produit/unite de create(),
        # et absente côté update() puisque non surchargé).
        if value is None:
            return value
        boutique = self.context['request'].user.profil.boutique
        if value.boutique_id != boutique.id:
            raise ValidationError("Ce fournisseur n'appartient pas à votre boutique.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        boutique = self.context['request'].user.profil.boutique
        if not boutique.actif:
            raise serializers.ValidationError("Cette boutique a été désactivée.")

        lignes_data = validated_data.pop('lignes')
        achat = Achat.objects.create(boutique=boutique, **validated_data)

        montant_total = 0
        # Un même achat peut contenir plusieurs lignes pour le même
        # produit (ex: 1 Sac 25kg + 3 Kg du même article). DRF désérialise
        # chaque ligne indépendamment, donc ligne_data['produit'] est une
        # instance Python différente par ligne, chacune chargée avec le
        # stock d'avant-transaction. Sans ce cache, chaque `produit.save()`
        # écraserait le précédent au lieu de cumuler les ajouts (même
        # bug que celui corrigé côté ventes en Phase 4A/4B).
        produits_par_id = {}

        for ligne_data in lignes_data:
            produit = ligne_data['produit']
            if produit.pk in produits_par_id:
                produit = produits_par_id[produit.pk]
            else:
                produits_par_id[produit.pk] = produit
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
            # (ex: 20000 FCFA le Sac 25kg -> 800 FCFA/unité de stock), pour
            # que le calcul du bénéfice (Tableau de bord) reste juste.
            produit.prix_achat = (prix / unite.facteur_conversion).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

            produit.save()

            # Enregistrer le mouvement de stock correspondant
            MouvementStock.objects.create(
                boutique=boutique,
                produit=produit,
                type_mouvement='ENTREE',
                quantite=unites_a_ajouter,
                motif=f"Achat fournisseur #{achat.id}"
            )

        achat.montant_total = montant_total
        achat.save()
        return achat
