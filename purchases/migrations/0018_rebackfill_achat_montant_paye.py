from django.db import migrations
from django.db.models import F


def rebackfill(apps, schema_editor):
    # Contract (1 bis) : les achats créés par l'ancien code pendant la
    # fenêtre de déploiement du commit 1 (après 0016, avant la bascule)
    # n'ont pas de montant_paye. Tous étaient payés comptant : même
    # traitement que 0016. Les achats déjà renseignés ne sont pas touchés.
    Achat = apps.get_model('purchases', 'Achat')
    Achat.objects.filter(montant_paye__isnull=True).update(montant_paye=F('montant_total'))


class Migration(migrations.Migration):
    dependencies = [
        ('purchases', '0017_paiementfournisseur'),
    ]
    operations = [
        # Retour arrière : rien à défaire, la valeur remplie reste juste.
        migrations.RunPython(rebackfill, migrations.RunPython.noop),
    ]
