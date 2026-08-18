from django.db import migrations

def backfill(apps, schema_editor):
    LigneVente = apps.get_model('sales', 'LigneVente')
    for lv in LigneVente.objects.filter(facteur_conversion_applique__isnull=True).select_related('unite'):
        lv.facteur_conversion_applique = lv.unite.facteur_conversion
        lv.save(update_fields=['facteur_conversion_applique'])

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0007_lignevente_facteur_conversion_applique'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
