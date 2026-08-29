from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0008_backfill_facteur_conversion_applique'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ligneachat',
            name='facteur_conversion_applique',
            field=models.DecimalField(max_digits=10, decimal_places=3),
        ),
    ]
