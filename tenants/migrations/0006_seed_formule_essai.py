from django.db import migrations


def creer_formule_essai(apps, schema_editor):
    FormuleAbonnement = apps.get_model('tenants', 'FormuleAbonnement')
    FormuleAbonnement.objects.get_or_create(
        nom='Essai gratuit',
        defaults={'duree_jours': 14, 'prix': 0, 'actif': False},
    )


def reverse(apps, schema_editor):
    FormuleAbonnement = apps.get_model('tenants', 'FormuleAbonnement')
    FormuleAbonnement.objects.filter(nom='Essai gratuit').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0005_paiementabonnement'),
    ]

    operations = [
        migrations.RunPython(creer_formule_essai, reverse),
    ]
