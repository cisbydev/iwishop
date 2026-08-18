from django.db.models import F, ExpressionWrapper, DecimalField

def unites_reelles_expr():
    # Lit le facteur figé sur la ligne au moment de la vente
    # (LigneVente.facteur_conversion_applique), jamais la valeur courante de
    # UniteVente : celle-ci peut être modifiée après coup, et les rapports
    # historiques ne doivent pas être réécrits rétroactivement.
    return ExpressionWrapper(
        F('quantite') * F('facteur_conversion_applique'),
        output_field=DecimalField(max_digits=14, decimal_places=3)
    )
