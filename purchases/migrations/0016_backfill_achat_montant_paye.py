from django.db import migrations
from django.db.models import F


def backfill(apps, schema_editor):
    # Avant ce champ, tout achat était payé comptant : montant_paye =
    # montant_total, y compris pour les achats annulés (la donnée décrit
    # ce qui a été versé, pas le statut). Une seule requête UPDATE.
    Achat = apps.get_model('purchases', 'Achat')
    Achat.objects.filter(montant_paye__isnull=True).update(montant_paye=F('montant_total'))


class Migration(migrations.Migration):
    dependencies = [
        ('purchases', '0015_achat_paiement'),
    ]
    operations = [
        # Retour arrière : rien à défaire ici, 0015 supprime la colonne.
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
