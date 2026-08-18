from django.db import migrations

NOM_UNITE_PAR_TYPE = {'UNITE': 'Unité', 'DOUZAINE': 'Douzaine'}

def backfill(apps, schema_editor):
    Boutique = apps.get_model('tenants', 'Boutique')
    UniteVente = apps.get_model('products', 'UniteVente')
    LigneVente = apps.get_model('sales', 'LigneVente')

    for boutique in Boutique.objects.all():
        unites_par_nom = {
            uv.nom: uv
            for uv in UniteVente.objects.filter(boutique=boutique, nom__in=NOM_UNITE_PAR_TYPE.values())
        }
        for type_vente, nom_unite in NOM_UNITE_PAR_TYPE.items():
            unite = unites_par_nom.get(nom_unite)
            if unite is None:
                continue
            LigneVente.objects.filter(
                boutique=boutique, type_vente=type_vente, unite__isnull=True
            ).update(unite=unite)

def reverse(apps, schema_editor):
    pass  # rollback = restauration depuis backup

class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0004_lignevente_unite'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
