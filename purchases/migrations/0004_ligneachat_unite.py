import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0009_backfill_unitevente_est_systeme'),
        ('purchases', '0003_alter_achat_boutique_alter_ligneachat_boutique'),
    ]

    operations = [
        migrations.AddField(
            model_name='ligneachat',
            name='unite',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='lignes_achat', to='products.unitevente'),
        ),
    ]
