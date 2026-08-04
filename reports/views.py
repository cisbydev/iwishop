from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, F, Case, When, IntegerField, ExpressionWrapper, DecimalField
from sales.models import LigneVente, Vente
from purchases.models import Achat
from expenses.models import Depense


class ResumeFinancierView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Récupérer les filtres de date optionnels (?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD)
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')

        ventes_qs = Vente.objects.all()
        achats_qs = Achat.objects.all()
        depenses_qs = Depense.objects.all()

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
        # Une "douzaine" représente toujours 12 unités : on convertit donc chaque
        # ligne de vente en nombre d'unités réelles avant de calculer le coût.
        unites_reelles_expr = Case(
            When(type_vente='DOUZAINE', then=F('quantite') * 12),
            default=F('quantite'),
            output_field=IntegerField()
        )

        # Bénéfice d'une ligne = montant vendu (sous_total) - coût d'achat (prix_achat x unités réelles)
        benefice_ligne_expr = ExpressionWrapper(
            F('sous_total') - F('produit__prix_achat') * unites_reelles_expr,
            output_field=DecimalField(max_digits=14, decimal_places=2)
        )

        benefice_brut = LigneVente.objects.filter(
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
