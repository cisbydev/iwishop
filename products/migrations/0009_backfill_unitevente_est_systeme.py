from django.db import migrations

NOMS_SYSTEME = ['Unité', 'Douzaine']

def backfill(apps, schema_editor):
    UniteVente = apps.get_model('products', 'UniteVente')
    UniteVente.objects.filter(nom__in=NOMS_SYSTEME).update(est_systeme=True)

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('products', '0008_unitevente_est_systeme_and_more'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
