from django.db import migrations

def backfill(apps, schema_editor):
    FormuleAbonnement = apps.get_model('tenants', 'FormuleAbonnement')
    # L'essai gratuit donne déjà accès à tout : cohérent de le classer
    # Premium plutôt que d'inventer un mécanisme séparé pour l'essai.
    FormuleAbonnement.objects.filter(nom='Essai gratuit').update(palier='PREMIUM')
    FormuleAbonnement.objects.filter(palier__isnull=True).update(palier='ESSENTIEL')

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0011_formuleabonnement_palier'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
