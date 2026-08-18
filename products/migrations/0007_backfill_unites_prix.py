from decimal import Decimal
from django.db import migrations

def backfill(apps, schema_editor):
    Boutique = apps.get_model('tenants', 'Boutique')
    Produit = apps.get_model('products', 'Produit')
    UniteVente = apps.get_model('products', 'UniteVente')
    ProduitPrix = apps.get_model('products', 'ProduitPrix')

    for boutique in Boutique.objects.all():
        unite_unite, _ = UniteVente.objects.get_or_create(
            boutique=boutique, nom='Unité',
            defaults={'facteur_conversion': Decimal('1.000')}
        )
        unite_douzaine, _ = UniteVente.objects.get_or_create(
            boutique=boutique, nom='Douzaine',
            defaults={'facteur_conversion': Decimal('12.000')}
        )

        for produit in Produit.objects.filter(boutique=boutique):
            ProduitPrix.objects.get_or_create(
                produit=produit, unite=unite_unite,
                defaults={'prix': produit.prix_unitaire}
            )
            ProduitPrix.objects.get_or_create(
                produit=produit, unite=unite_douzaine,
                defaults={'prix': produit.prix_douzaine}
            )

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup (voir notes de la Phase 2)

class Migration(migrations.Migration):
    dependencies = [
        ('products', '0006_unitevente_produitprix'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
