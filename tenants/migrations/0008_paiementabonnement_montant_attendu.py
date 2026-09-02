from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0007_paiementabonnement_url_paiement'),
    ]

    operations = [
        migrations.AddField(
            model_name='paiementabonnement',
            name='montant_attendu',
            field=models.DecimalField(max_digits=10, decimal_places=2, null=True),
        ),
    ]
