from django.db import migrations

def backfill(apps, schema_editor):
    Boutique = apps.get_model('tenants', 'Boutique')
    Profil = apps.get_model('tenants', 'Profil')
    User = apps.get_model('auth', 'User')
    Produit = apps.get_model('products', 'Produit')
    Categorie = apps.get_model('categories', 'Categorie')
    Fournisseur = apps.get_model('suppliers', 'Fournisseur')
    MouvementStock = apps.get_model('inventory', 'MouvementStock')
    Achat = apps.get_model('purchases', 'Achat')
    LigneAchat = apps.get_model('purchases', 'LigneAchat')
    Vente = apps.get_model('sales', 'Vente')
    LigneVente = apps.get_model('sales', 'LigneVente')
    Depense = apps.get_model('expenses', 'Depense')
    ParametresBoutique = apps.get_model('parametres', 'ParametresBoutique')

    boutique, _ = Boutique.objects.get_or_create(
        slug='ma-boutique',
        defaults={'nom': 'Ma Boutique', 'actif': True}
    )

    owner = User.objects.filter(is_superuser=True).first()
    if owner and not Profil.objects.filter(user=owner).exists():
        Profil.objects.create(user=owner, boutique=boutique, est_proprietaire=True)

    Produit.objects.filter(boutique__isnull=True).update(boutique=boutique)
    Categorie.objects.filter(boutique__isnull=True).update(boutique=boutique)
    Fournisseur.objects.filter(boutique__isnull=True).update(boutique=boutique)
    MouvementStock.objects.filter(boutique__isnull=True).update(boutique=boutique)
    Achat.objects.filter(boutique__isnull=True).update(boutique=boutique)
    LigneAchat.objects.filter(boutique__isnull=True).update(boutique=boutique)
    Vente.objects.filter(boutique__isnull=True).update(boutique=boutique)
    LigneVente.objects.filter(boutique__isnull=True).update(boutique=boutique)
    Depense.objects.filter(boutique__isnull=True).update(boutique=boutique)
    ParametresBoutique.objects.filter(boutique__isnull=True).update(boutique=boutique)

def reverse(apps, schema_editor):
    pass  # pas de retour en arrière nécessaire

class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0001_initial'),
        ('products', '0004_produit_boutique'),
        ('categories', '0002_categorie_boutique'),
        ('suppliers', '0002_fournisseur_boutique'),
        ('inventory', '0002_mouvementstock_boutique'),
        ('purchases', '0002_achat_boutique_ligneachat_boutique'),
        ('sales', '0002_lignevente_boutique_vente_boutique'),
        ('expenses', '0002_depense_boutique'),
        ('parametres', '0002_parametresboutique_boutique'),
    ]
    operations = [
        migrations.RunPython(backfill, reverse),
    ]
