import django.core.validators
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0018_rebackfill_achat_montant_paye'),
    ]

    operations = [
        migrations.AlterField(
            model_name='achat',
            name='montant_paye',
            field=models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0'))]),
        ),
    ]
