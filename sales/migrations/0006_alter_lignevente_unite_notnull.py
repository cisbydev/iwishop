import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0005_backfill_lignevente_unite'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lignevente',
            name='unite',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='lignes_vente', to='products.unitevente'),
        ),
    ]
