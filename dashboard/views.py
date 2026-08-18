from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from sales.models import Vente, LigneVente
from sales.utils import unites_reelles_expr
from products.models import Produit
from inventory.models import MouvementStock


class TableauDeBordView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        support_boutique_id = request.headers.get('X-Support-Boutique')
        if support_boutique_id and request.user.is_superuser:
            from tenants.models import Boutique
            boutique = Boutique.objects.get(pk=support_boutique_id)
        else:
            boutique = request.user.profil.boutique
        maintenant = timezone.now()
        aujourd_hui = maintenant.date()
        mois_courant = maintenant.month
        annee_courante = maintenant.year

        ca_jour = Vente.objects.filter(boutique=boutique, date_vente__date=aujourd_hui).aggregate(total=Sum('montant_net'))['total'] or 0
        ca_mois = Vente.objects.filter(boutique=boutique, date_vente__year=annee_courante, date_vente__month=mois_courant).aggregate(total=Sum('montant_net'))['total'] or 0
        nombre_ventes_jour = Vente.objects.filter(boutique=boutique, date_vente__date=aujourd_hui).count()

        produits_rupture = Produit.objects.filter(boutique=boutique, quantite_en_stock__lte=0).count()
        produits_stock_faible = Produit.objects.filter(boutique=boutique, quantite_en_stock__gt=0, quantite_en_stock__lte=F('stock_minimum')).count()

        derniers_mouvements = MouvementStock.objects.select_related('produit').filter(boutique=boutique)[:5]
        mouvements_data = [{
            "id": m.id,
            "produit": m.produit.nom,
            "type": m.type_mouvement,
            "quantite": m.quantite,
            "date": m.date_mouvement
        } for m in derniers_mouvements]

        # --- Calcul du bénéfice ---
        # Convertit chaque ligne de vente en nombre d'unités réelles via le
        # facteur de conversion centralisé sur son unité de vente.
        unites_reelles = unites_reelles_expr()

        # Bénéfice d'une ligne = montant vendu (sous_total) - coût d'achat (prix_achat x unités réelles)
        benefice_ligne_expr = ExpressionWrapper(
            F('sous_total') - F('produit__prix_achat') * unites_reelles,
            output_field=DecimalField(max_digits=14, decimal_places=2)
        )

        benefice_jour = LigneVente.objects.filter(
            boutique=boutique,
            vente__date_vente__date=aujourd_hui
        ).aggregate(total=Sum(benefice_ligne_expr))['total'] or 0

        benefice_mois = LigneVente.objects.filter(
            boutique=boutique,
            vente__date_vente__year=annee_courante,
            vente__date_vente__month=mois_courant
        ).aggregate(total=Sum(benefice_ligne_expr))['total'] or 0

        # --- Meilleurs produits (top 5, toutes ventes confondues) ---
        meilleurs_produits_qs = (
            LigneVente.objects
            .filter(boutique=boutique)
            .values('produit__id', 'produit__nom')
            .annotate(
                unites_vendues=Sum(unites_reelles),
                chiffre_affaires=Sum('sous_total')
            )
            .order_by('-unites_vendues')[:5]
        )

        def formater_unites(valeur):
            return int(valeur) if valeur == valeur.to_integral_value() else float(valeur)

        meilleurs_produits = [{
            "produit_id": item['produit__id'],
            "nom": item['produit__nom'],
            "unites_vendues": formater_unites(item['unites_vendues']),
            "chiffre_affaires": item['chiffre_affaires'],
        } for item in meilleurs_produits_qs]

        return Response({
            "chiffre_affaires_jour": ca_jour,
            "chiffre_affaires_mois": ca_mois,
            "nombre_ventes_jour": nombre_ventes_jour,
            "benefice_jour": benefice_jour,
            "benefice_mois": benefice_mois,
            "produits_rupture_count": produits_rupture,
            "produits_stock_faible_count": produits_stock_faible,
            "derniers_mouvements": mouvements_data,
            "meilleurs_produits": meilleurs_produits,
        })
