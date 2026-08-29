from django.db import migrations

def backfill(apps, schema_editor):
    LigneAchat = apps.get_model('purchases', 'LigneAchat')
    for la in LigneAchat.objects.filter(facteur_conversion_applique__isnull=True).select_related('unite'):
        la.facteur_conversion_applique = la.unite.facteur_conversion
        la.save(update_fields=['facteur_conversion_applique'])

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('purchases', '0007_ligneachat_facteur_conversion_applique'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
