from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from sales.models import LigneVente, Vente
from sales.utils import unites_reelles_expr
from purchases.models import Achat
from expenses.models import Depense


class ResumeFinancierView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        support_boutique_id = request.headers.get('X-Support-Boutique')
        if support_boutique_id and request.user.is_superuser:
            from tenants.models import Boutique
            boutique = Boutique.objects.get(pk=support_boutique_id)
        else:
            boutique = request.user.profil.boutique
        # Récupérer les filtres de date optionnels (?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD)
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')

        # Les ventes annulées ne doivent plus compter dans le CA ni le
        # bénéfice (cf. VenteViewSet.annuler) ; benefice_brut hérite de ce
        # filtre via `vente__in=ventes_qs` plus bas.
        ventes_qs = Vente.objects.filter(boutique=boutique, statut='VALIDEE')
        # Les achats annulés ne doivent plus compter dans le total ni le
        # nombre d'achats (cf. AchatViewSet.annuler).
        achats_qs = Achat.objects.filter(boutique=boutique, statut='VALIDE')
        depenses_qs = Depense.objects.filter(boutique=boutique)

        if date_debut and date_fin:
            ventes_qs = ventes_qs.filter(date_vente__date__range=[date_debut, date_fin])
            achats_qs = achats_qs.filter(date_achat__date__range=[date_debut, date_fin])
            depenses_qs = depenses_qs.filter(date_depense__range=[date_debut, date_fin])

        # Chiffre d'affaires total
        chiffre_affaires = ventes_qs.aggregate(total=Sum('montant_net'))['total'] or 0

        # Total des achats
        total_achats = achats_qs.aggregate(total=Sum('montant_total'))['total'] or 0

        # Total des dépenses
        total_depenses = depenses_qs.aggregate(total=Sum('montant'))['total'] or 0

        # --- Bénéfice brut, calculé directement en base de données ---
        # Convertit chaque ligne de vente en nombre d'unités réelles via le
        # facteur de conversion centralisé sur son unité de vente.
        unites_reelles = unites_reelles_expr()

        # Bénéfice d'une ligne = montant vendu (sous_total) - coût d'achat (prix_achat x unités réelles)
        benefice_ligne_expr = ExpressionWrapper(
            F('sous_total') - F('produit__prix_achat') * unites_reelles,
            output_field=DecimalField(max_digits=14, decimal_places=2)
        )

        benefice_brut = LigneVente.objects.filter(
            boutique=boutique,
            vente__in=ventes_qs
        ).aggregate(total=Sum(benefice_ligne_expr))['total'] or 0

        # Bénéfice net = Bénéfice brut - Total des dépenses
        benefice_net = benefice_brut - total_depenses

        return Response({
            "date_debut": date_debut,
            "date_fin": date_fin,
            "chiffre_affaires": chiffre_affaires,
            "total_achats": total_achats,
            "total_depenses": total_depenses,
            "benefice_brut": benefice_brut,
            "benefice_net": benefice_net,
            "nombre_ventes": ventes_qs.count(),
            "nombre_achats": achats_qs.count(),
            "nombre_depenses": depenses_qs.count(),
        })
