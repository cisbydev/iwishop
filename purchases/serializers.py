from rest_framework import serializers
from .models import Achat, LigneAchat
from inventory.models import MouvementStock
from django.db import transaction

class LigneAchatSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')

    class Meta:
        model = LigneAchat
        fields = ['id', 'produit', 'produit_nom', 'quantite', 'prix_unitaire_achat', 'sous_total']
        read_only_fields = ['sous_total']

class AchatSerializer(serializers.ModelSerializer):
    lignes = LigneAchatSerializer(many=True)
    fournisseur_nom = serializers.ReadOnlyField(source='fournisseur.nom')

    class Meta:
        model = Achat
        fields = ['id', 'fournisseur', 'fournisseur_nom', 'date_achat', 'montant_total', 'notes', 'lignes']
        read_only_fields = ['montant_total', 'date_achat']

    @transaction.atomic
    def create(self, validated_data):
        lignes_data = validated_data.pop('lignes')
        achat = Achat.objects.create(**validated_data)

        montant_total = 0
        for ligne_data in lignes_data:
            quantite = ligne_data['quantite']
            prix = ligne_data['prix_unitaire_achat']
            produit = ligne_data['produit']

            # Créer la ligne d'achat
            ligne = LigneAchat.objects.create(achat=achat, **ligne_data)
            montant_total += ligne.sous_total

            # Mettre à jour le stock du produit
            produit.quantite_en_stock += quantite

            # Le prix d'achat du produit reflète désormais le dernier prix
            # réellement payé au fournisseur, pour que le calcul du bénéfice
            # (Tableau de bord) reste juste dans le temps.
            produit.prix_achat = prix

            produit.save()

            # Enregistrer le mouvement de stock correspondant
            MouvementStock.objects.create(
                produit=produit,
                type_mouvement='ENTREE',
                quantite=quantite,
                motif=f"Achat fournisseur #{achat.id}"
            )

        achat.montant_total = montant_total
        achat.save()
        return achat