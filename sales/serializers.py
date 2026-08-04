from rest_framework import serializers
from django.db import transaction
from .models import Vente, LigneVente
from inventory.models import MouvementStock
from rest_framework.exceptions import ValidationError

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
        lignes_data = validated_data.pop('lignes')

        # Assigner l'utilisateur connecté si présent dans le contexte de la requête
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['utilisateur'] = request.user

        vente = Vente.objects.create(**validated_data)

        montant_total = 0

        for ligne_data in lignes_data:
            produit = ligne_data['produit']
            quantite = ligne_data['quantite']
            type_vente = ligne_data['type_vente']

            # Calculer le nombre d'unités réelles à déduire du stock
            # 1 douzaine = 12 unités
            unites_a_deduire = quantite * 12 if type_vente == 'DOUZAINE' else quantite

            # Règle métier : Vérification stricte du stock disponible
            if produit.quantite_en_stock < unites_a_deduire:
                raise ValidationError(
                    f"Stock insuffisant pour le produit '{produit.nom}'. "
                    f"Demandé : {unites_a_deduire} unités, Disponible : {produit.quantite_en_stock} unités."
                )

            # Créer la ligne de vente
            ligne = LigneVente.objects.create(vente=vente, **ligne_data)
            montant_total += ligne.sous_total

            # Mettre à jour le stock du produit
            produit.quantite_en_stock -= unites_a_deduire
            produit.save()

            # Enregistrer le mouvement de stock (SORTIE)
            MouvementStock.objects.create(
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