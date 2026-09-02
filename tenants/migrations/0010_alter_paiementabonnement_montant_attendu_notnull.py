from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0009_backfill_montant_attendu'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paiementabonnement',
            name='montant_attendu',
            field=models.DecimalField(max_digits=10, decimal_places=2),
        ),
    ]
