from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0012_backfill_palier'),
    ]

    operations = [
        migrations.AlterField(
            model_name='formuleabonnement',
            name='palier',
            field=models.CharField(
                choices=[('ESSENTIEL', 'Essentiel'), ('PREMIUM', 'Premium')],
                max_length=20,
            ),
        ),
    ]
