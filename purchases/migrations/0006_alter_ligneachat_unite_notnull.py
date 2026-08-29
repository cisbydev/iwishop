import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0005_backfill_ligneachat_unite'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ligneachat',
            name='unite',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='lignes_achat', to='products.unitevente'),
        ),
    ]
