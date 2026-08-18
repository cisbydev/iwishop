from rest_framework import serializers
from django.db import transaction
from .models import Vente, LigneVente
from inventory.models import MouvementStock
from products.models import UniteVente, ProduitPrix
from rest_framework.exceptions import ValidationError

NOM_UNITE_PAR_TYPE = {'UNITE': 'Unité', 'DOUZAINE': 'Douzaine'}

class LigneVenteSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')

    class Meta:
        model = LigneVente
        fields = ['id', 'produit', 'produit_nom', 'quantite', 'type_vente', 'prix_applique', 'sous_total']
        read_only_fields = ['sous_total']

class VenteSerializer(serializers.ModelSerializer):
    lignes = LigneVenteSerializer(many=True)
    utilisateur_nom = serializers.ReadOnlyField(source='utilisateur.username')

    class Meta:
        model = Vente
        fields = [
            'id', 'numero', 'date_vente', 'client', 'montant_total', 
            'remise', 'montant_net', 'montant_paye', 'monnaie_rendue', 
            'mode_paiement', 'utilisateur', 'utilisateur_nom', 'lignes'
        ]
        read_only_fields = ['numero', 'date_vente', 'montant_total', 'montant_net', 'monnaie_rendue']

    @transaction.atomic
    def create(self, validated_data):
        boutique = self.context['request'].user.profil.boutique
        if not boutique.actif:
            raise serializers.ValidationError("Cette boutique a été désactivée.")

        lignes_data = validated_data.pop('lignes')

        # Assigner l'utilisateur connecté si présent dans le contexte de la requête
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['utilisateur'] = request.user

        vente = Vente.objects.create(boutique=boutique, **validated_data)

        montant_total = 0

        for ligne_data in lignes_data:
            produit = ligne_data['produit']
            quantite = ligne_data['quantite']
            type_vente = ligne_data['type_vente']
            nom_unite = NOM_UNITE_PAR_TYPE[type_vente]

            try:
                unite = UniteVente.objects.get(boutique=boutique, nom=nom_unite)
            except UniteVente.DoesNotExist:
                raise ValidationError(
                    f"Aucune unité '{nom_unite}' n'est configurée pour votre boutique. "
                    f"Contactez le support."
                )

            try:
                produit_prix = ProduitPrix.objects.get(produit=produit, unite=unite)
            except ProduitPrix.DoesNotExist:
                raise ValidationError(
                    f"Aucun prix configuré pour '{produit.nom}' en '{nom_unite}'."
                )

            # Calculer le nombre d'unités réelles à déduire du stock, via le
            # facteur de conversion centralisé sur l'unité de vente.
            unites_reelles = quantite * unite.facteur_conversion
            if unites_reelles != unites_reelles.to_integral_value():
                raise ValidationError(
                    f"'{produit.nom}' ne peut pas être vendu en quantité fractionnaire "
                    f"avec l'unité '{nom_unite}' pour le moment. Utilisez une quantité entière."
                )
            unites_a_deduire = int(unites_reelles)

            # Règle métier : Vérification stricte du stock disponible
            if produit.quantite_en_stock < unites_a_deduire:
                raise ValidationError(
                    f"Stock insuffisant pour le produit '{produit.nom}'. "
                    f"Demandé : {unites_a_deduire} unités, Disponible : {produit.quantite_en_stock} unités."
                )

            # Le prix et le facteur de conversion sont figés sur la ligne au
            # moment de la vente (comme prix_applique) : les rapports
            # historiques ne doivent jamais être recalculés en direct depuis
            # UniteVente, qui peut être modifiée après coup.
            ligne_data['unite'] = unite
            ligne_data['facteur_conversion_applique'] = unite.facteur_conversion
            ligne_data['prix_applique'] = produit_prix.prix

            # Créer la ligne de vente
            ligne = LigneVente.objects.create(vente=vente, boutique=boutique, **ligne_data)
            montant_total += ligne.sous_total

            # Mettre à jour le stock du produit
            produit.quantite_en_stock -= unites_a_deduire
            produit.save()

            # Enregistrer le mouvement de stock (SORTIE)
            MouvementStock.objects.create(
                boutique=boutique,
                produit=produit,
                type_mouvement='SORTIE',
                quantite=unites_a_deduire,
                motif=f"Vente #{vente.numero}"
            )

        # Calculs financiers finaux
        remise = vente.remise or 0
        montant_net = montant_total - remise

        if vente.montant_paye < montant_net:
            raise ValidationError("Le montant payé est inférieur au montant net de la vente.")

        monnaie_rendue = vente.montant_paye - montant_net

        vente.montant_total = montant_total
        vente.montant_net = montant_net
        vente.monnaie_rendue = monnaie_rendue
        vente.save()

        return vente