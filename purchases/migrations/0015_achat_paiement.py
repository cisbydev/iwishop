import django.core.validators
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0014_alter_ligneachat_quantite'),
    ]

    operations = [
        migrations.AddField(
            model_name='achat',
            name='statut_paiement',
            field=models.CharField(choices=[('paye', 'Payé intégralement'), ('partiel', 'Partiellement payé'), ('en_attente', 'En attente (crédit)')], db_default='paye', default='paye', max_length=20),
        ),
        migrations.AddField(
            model_name='achat',
            name='montant_du',
            field=models.DecimalField(db_default=0, decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='achat',
            name='montant_paye',
            field=models.DecimalField(decimal_places=2, max_digits=12, null=True, validators=[django.core.validators.MinValueValidator(Decimal('0'))]),
        ),
        migrations.AddField(
            model_name='achat',
            name='mode_paiement',
            field=models.CharField(blank=True, choices=[('ESPECES', 'Espèces'), ('MOBILE_MONEY', 'Mobile Money'), ('CARTE', 'Carte bancaire'), ('AUTRE', 'Autre')], max_length=30, null=True),
        ),
    ]
