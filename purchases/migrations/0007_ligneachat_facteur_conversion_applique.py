from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0006_alter_ligneachat_unite_notnull'),
    ]

    operations = [
        migrations.AddField(
            model_name='ligneachat',
            name='facteur_conversion_applique',
            field=models.DecimalField(decimal_places=3, max_digits=10, null=True),
        ),
    ]
