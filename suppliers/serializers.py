from collections import defaultdict
from decimal import Decimal

from rest_framework import serializers

from purchases.models import Achat, PaiementFournisseur
from .models import Fournisseur

class FournisseurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fournisseur
        fields = '__all__'
        read_only_fields = ['boutique']


class FournisseurAvecDetteSerializer(serializers.ModelSerializer):
    # Annotés par FournisseurViewSet.avec_dette() (agrégats en base, pas des
    # champs du modèle) : à déclarer explicitement, comme
    # ClientAvecDetteSerializer.
    dette_totale = serializers.DecimalField(max_digits=12, decimal_places=2)
    plus_ancienne_dette = serializers.DateTimeField()

    class Meta:
        model = Fournisseur
        fields = [
            'id', 'nom', 'telephone', 'adresse', 'date_creation',
            'dette_totale', 'plus_ancienne_dette',
        ]


def _montant(valeur):
    # Même représentation que les autres montants de l'API (chaîne à 2
    # décimales), jamais un float.
    return serializers.DecimalField(max_digits=12, decimal_places=2).to_representation(valeur)


class PaiementHistoriqueSerializer(serializers.ModelSerializer):
    enregistre_par_nom = serializers.ReadOnlyField(source='enregistre_par.username')

    class Meta:
        model = PaiementFournisseur
        fields = ['id', 'montant', 'date_paiement', 'enregistre_par_nom', 'mode_paiement']


class CorrectionHistoriqueSerializer(serializers.ModelSerializer):
    enregistre_par_nom = serializers.ReadOnlyField(source='enregistre_par.username')

    class Meta:
        model = PaiementFournisseur
        fields = ['id', 'montant', 'date_paiement', 'enregistre_par_nom', 'motif_correction']


class AchatHistoriqueFournisseurSerializer(serializers.ModelSerializer):
    """Achat à crédit dans l'historique d'un fournisseur. Le regroupement
    des corrections et les montants dérivés (montant effectif de chaque
    paiement, total des paiements) sont calculés ici, en Decimal : le
    frontend affiche, il ne calcule aucun montant (cf. CLAUDE.md). Lit les
    paiements préchargés (FournisseurViewSet.historique) : aucune requête
    par achat."""
    total_paiements = serializers.SerializerMethodField()
    paiements = serializers.SerializerMethodField()

    class Meta:
        model = Achat
        fields = [
            'id', 'date_achat', 'statut', 'montant_total', 'montant_paye', 'mode_paiement',
            'montant_du', 'statut_paiement', 'total_paiements', 'paiements',
        ]

    def get_total_paiements(self, achat):
        return _montant(sum((ligne.montant for ligne in achat.paiements.all()), Decimal('0')))

    def get_paiements(self, achat):
        lignes = list(achat.paiements.all())
        corrections = defaultdict(list)
        for ligne in lignes:
            if ligne.paiement_corrige_id is not None:
                corrections[ligne.paiement_corrige_id].append(ligne)

        resultat = []
        for original in lignes:
            if original.paiement_corrige_id is not None:
                continue
            les_siennes = corrections[original.id]
            data = PaiementHistoriqueSerializer(original).data
            data['montant_effectif'] = _montant(
                original.montant + sum((c.montant for c in les_siennes), Decimal('0'))
            )
            data['corrections'] = CorrectionHistoriqueSerializer(les_siennes, many=True).data
            resultat.append(data)
        return resultat
