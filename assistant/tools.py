from django.db.models import F, Q, Sum

from products.models import Produit
from reports.views import calculer_resume_financier
from sales.models import Client


def obtenir_resume_financier(boutique, date_debut=None, date_fin=None):
    """Réutilise reports.views.calculer_resume_financier() telle quelle -
    une seule source de vérité pour ce calcul, partagée avec les vues
    JSON/PDF/Excel des rapports."""
    return calculer_resume_financier(boutique, date_debut, date_fin)


def lister_clients_en_dette(boutique):
    """Même filtre d'agrégation que sales.views.ClientViewSet.avec_dette()
    (dupliqué ici volontairement : forme de retour différente - un dict
    JSON-sérialisable pour l'IA, pas une réponse DRF paginée - factoriser
    n'apporterait pas grand-chose pour 4 lignes de queryset)."""
    clients = Client.objects.filter(boutique=boutique).annotate(
        dette_totale=Sum(
            'ventes__montant_du',
            filter=Q(ventes__montant_du__gt=0, ventes__statut='VALIDEE'),
        )
    ).filter(dette_totale__gt=0).order_by('-dette_totale')

    return {
        "clients_en_dette": [
            {"id": client.id, "nom": client.nom, "telephone": client.telephone, "dette_totale": client.dette_totale}
            for client in clients
        ]
    }


def obtenir_stock_faible(boutique):
    """Produits dont le stock est descendu à ou sous leur seuil minimum,
    scopés à la boutique."""
    produits = Produit.objects.filter(
        boutique=boutique, quantite_en_stock__lte=F('stock_minimum'),
    ).order_by('quantite_en_stock')

    return {
        "produits_stock_faible": [
            {
                "id": produit.id, "nom": produit.nom,
                "quantite_en_stock": produit.quantite_en_stock, "stock_minimum": produit.stock_minimum,
            }
            for produit in produits
        ]
    }


# Fonctions routées par nom depuis AssistantView - `boutique` y est TOUJOURS
# injecté côté serveur (jamais lu depuis l'entrée fournie par le modèle),
# donc volontairement absent de chaque input_schema ci-dessous.
OUTILS_PAR_NOM = {
    "obtenir_resume_financier": obtenir_resume_financier,
    "lister_clients_en_dette": lister_clients_en_dette,
    "obtenir_stock_faible": obtenir_stock_faible,
}

# Schémas au format "tool use" de l'API Anthropic (Messages API).
SCHEMAS_OUTILS = [
    {
        "name": "obtenir_resume_financier",
        "description": (
            "Retourne le résumé financier de la boutique (chiffre d'affaires, achats, dépenses, "
            "bénéfice brut, bénéfice net) sur une période optionnelle."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date_debut": {
                    "type": "string",
                    "description": "Date de début au format YYYY-MM-DD. Omettre pour ne pas filtrer par date.",
                },
                "date_fin": {
                    "type": "string",
                    "description": "Date de fin au format YYYY-MM-DD. Omettre pour ne pas filtrer par date.",
                },
            },
        },
    },
    {
        "name": "lister_clients_en_dette",
        "description": (
            "Liste les clients de la boutique ayant une dette (vente à crédit) non soldée, "
            "du plus endetté au moins endetté."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "obtenir_stock_faible",
        "description": "Liste les produits de la boutique dont le stock est descendu à ou sous leur seuil minimum.",
        "input_schema": {"type": "object", "properties": {}},
    },
]
