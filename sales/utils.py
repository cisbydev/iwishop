from django.db.models import F, ExpressionWrapper, DecimalField

def unites_reelles_expr():
    return ExpressionWrapper(
        F('quantite') * F('unite__facteur_conversion'),
        output_field=DecimalField(max_digits=14, decimal_places=3)
    )
