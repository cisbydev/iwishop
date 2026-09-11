from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    """Crée la table de cache partagée (CACHES['default']['LOCATION'] dans
    settings.py) via la commande native Django, pour qu'elle existe
    automatiquement après chaque déploiement (build.sh exécute déjà
    `migrate`) sans étape manuelle séparée."""
    call_command(
        'createcachetable',
        'django_cache_table',
        database=schema_editor.connection.alias,
    )


def drop_cache_table(apps, schema_editor):
    table_name = schema_editor.connection.ops.quote_name('django_cache_table')
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f'DROP TABLE IF EXISTS {table_name}')


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.RunPython(create_cache_table, drop_cache_table),
    ]
