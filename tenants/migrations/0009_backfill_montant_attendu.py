from django.db import migrations

def backfill(apps, schema_editor):
    PaiementAbonnement = apps.get_model('tenants', 'PaiementAbonnement')
    for paiement in PaiementAbonnement.objects.filter(montant_attendu__isnull=True).select_related('formule'):
        paiement.montant_attendu = paiement.formule.prix
        paiement.save(update_fields=['montant_attendu'])

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0008_paiementabonnement_montant_attendu'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
