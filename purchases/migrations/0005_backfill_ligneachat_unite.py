from django.db import migrations

def backfill(apps, schema_editor):
    Boutique = apps.get_model('tenants', 'Boutique')
    UniteVente = apps.get_model('products', 'UniteVente')
    LigneAchat = apps.get_model('purchases', 'LigneAchat')

    for boutique in Boutique.objects.all():
        # Les achats historiques (avant cette phase) étaient toujours
        # saisis directement en unités de stock : l'unité système "Unité"
        # (facteur_conversion=1) est donc l'équivalent exact de leur
        # quantite d'origine.
        unite = UniteVente.objects.filter(boutique=boutique, nom='Unité').first()
        if unite is None:
            continue
        LigneAchat.objects.filter(boutique=boutique, unite__isnull=True).update(unite=unite)

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('purchases', '0004_ligneachat_unite'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
