"""Données de démonstration pour les captures de la landing page.

Crée un compte « demo », propriétaire de deux boutiques fictives, chacune
avec un abonnement actif, des produits et des ventes du jour. Les ventes
passent par l'API (APIClient), comme dans l'app : stock, montants et
tableau de bord sont calculés par le code réel, jamais écrits à la main.

Refuse de tourner hors d'une base locale (DEBUG obligatoire, SQLite ou
PostgreSQL sur localhost) : jamais sur la base de prod.
"""
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from categories.models import Categorie
from parametres.models import ParametresBoutique
from products.models import UNITES_PAR_DEFAUT, Produit, ProduitPrix, UniteVente
from tenants.models import Abonnement, Boutique, FormuleAbonnement, Profil

HOTES_LOCAUX = {'localhost', '127.0.0.1', '::1'}
NOM_UTILISATEUR = 'demo'

# Abonnement actif pour chaque boutique : la démo ne dépend pas de la règle
# « pas d'abonnement = accès autorisé » (abonnement_valide), appelée à
# disparaître. « 1 MOIS » est la formule payante de la prod (relevée dans
# l'admin le 2026-10-22) ; une base locale neuve ne l'a pas (seule « Essai
# gratuit » vient d'une migration) : elle est alors créée avec les mêmes
# valeurs, sinon réutilisée telle quelle.
FORMULE_DEMO = '1 MOIS'
VALEURS_FORMULE_DEMO = {
    'duree_jours': 30, 'prix': Decimal('15000'), 'actif': True, 'palier': FormuleAbonnement.Palier.PREMIUM,
}
DUREE_ABONNEMENT_DEMO_JOURS = 365

# (nom, catégorie, prix d'achat, prix unitaire, prix douzaine, stock, stock minimum)
PRODUITS_BOUTIQUE_1 = [
    ('Riz parfumé 25 kg', 'Alimentation', 15000, 17500, 204000, 30, 5),
    ('Huile végétale 5 L', 'Alimentation', 6500, 7500, 87000, 3, 5),
    ('Sucre en morceaux 1 kg', 'Alimentation', 700, 850, 9600, 48, 10),
    ('Lait en poudre 400 g', 'Alimentation', 2200, 2600, 30000, 4, 6),
    ('Thé vert (paquet)', 'Alimentation', 450, 600, 6600, 72, 12),
    ('Savon de ménage', 'Entretien', 250, 350, 3900, 6, 12),
    ('Pagne wax 6 yards', 'Textile', 9000, 12500, 144000, 12, 3),
    ('Beurre de karité 250 g', 'Cosmétiques', 1200, 1750, 19500, 20, 5),
    ('Eau minérale 1,5 L', 'Boissons', 300, 400, 4500, 10, 24),
    ('Jus de bissap 1 L', 'Boissons', 600, 900, 10200, 24, 6),
    ('Lait de corps 400 ml', 'Cosmétiques', 1500, 2000, 22000, 3, 4),
]

# Ventes du jour (boutique 1) : (mode de paiement, [(produit, quantité)]).
# Les produits en stock faible ne sont pas vendus : le nombre affiché
# (5) reste stable.
VENTES_BOUTIQUE_1 = [
    ('ESPECES', [('Riz parfumé 25 kg', 2), ('Sucre en morceaux 1 kg', 6)]),
    ('MOBILE_MONEY', [('Pagne wax 6 yards', 2)]),
    ('ESPECES', [('Thé vert (paquet)', 12), ('Sucre en morceaux 1 kg', 4)]),
    ('MOBILE_MONEY', [('Riz parfumé 25 kg', 1), ('Beurre de karité 250 g', 3)]),
    ('ESPECES', [('Jus de bissap 1 L', 6), ('Thé vert (paquet)', 6)]),
    ('ESPECES', [('Pagne wax 6 yards', 1), ('Beurre de karité 250 g', 2)]),
    ('MOBILE_MONEY', [('Riz parfumé 25 kg', 2)]),
]

PRODUITS_BOUTIQUE_2 = [
    ('Pagne wax 6 yards', 'Textile', 9000, 12500, 144000, 18, 3),
    ('Bazin riche (mètre)', 'Textile', 3500, 5000, 57000, 40, 10),
    ('Foulard imprimé', 'Accessoires', 1000, 1500, 16500, 25, 6),
]

VENTES_BOUTIQUE_2 = [
    ('ESPECES', [('Bazin riche (mètre)', 5)]),
    ('MOBILE_MONEY', [('Pagne wax 6 yards', 1), ('Foulard imprimé', 2)]),
]


def verifier_base_locale():
    if not settings.DEBUG:
        raise CommandError("seed_demo refuse de tourner sans DEBUG : base locale seulement.")
    base = connection.settings_dict
    if base['ENGINE'].endswith('sqlite3'):
        return
    if base.get('HOST') not in HOTES_LOCAUX:
        raise CommandError(
            f"seed_demo refuse de tourner hors de localhost (hôte : {base.get('HOST') or 'non précisé'})."
        )


class Command(BaseCommand):
    help = "Crée des données de démonstration (compte « demo », deux boutiques fictives). Base locale seulement."

    def add_arguments(self, parser):
        parser.add_argument('--mot-de-passe', required=True, help="Mot de passe du compte « demo ».")

    def handle(self, *args, **options):
        verifier_base_locale()
        if User.objects.filter(username=NOM_UTILISATEUR).exists():
            raise CommandError(f"Le compte « {NOM_UTILISATEUR} » existe déjà : rien n'est créé.")

        with transaction.atomic():
            user = User.objects.create_user(
                username=NOM_UTILISATEUR, password=options['mot_de_passe'], first_name='Compte démo',
            )
            formule = FormuleAbonnement.objects.filter(nom=FORMULE_DEMO).order_by('pk').first()
            if formule is None:
                formule = FormuleAbonnement.objects.create(nom=FORMULE_DEMO, **VALEURS_FORMULE_DEMO)
            boutique_1 = self._boutique(user, 'Boutique Démo - Marché Rose', PRODUITS_BOUTIQUE_1, formule)
            boutique_2 = self._boutique(user, 'Boutique Démo - Kalaban', PRODUITS_BOUTIQUE_2, formule)

            client = APIClient(SERVER_NAME='localhost')
            client.force_authenticate(user=user)
            for boutique, ventes in ((boutique_1, VENTES_BOUTIQUE_1), (boutique_2, VENTES_BOUTIQUE_2)):
                self._vendre(client, boutique, ventes)

        self.stdout.write(self.style.SUCCESS(
            f"Compte « {NOM_UTILISATEUR} » créé, propriétaire de « {boutique_1.nom} » et « {boutique_2.nom} »."
        ))

    def _boutique(self, user, nom, produits, formule):
        boutique = Boutique.objects.create(nom=nom, slug=f"demo-{Boutique.objects.count() + 1}")
        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=True)
        aujourdhui = timezone.localdate()
        Abonnement.objects.create(
            boutique=boutique, formule=formule, statut='ACTIF', reference_paiement='DEMO',
            date_debut=aujourdhui, date_fin=aujourdhui + timezone.timedelta(days=DUREE_ABONNEMENT_DEMO_JOURS),
        )
        ParametresBoutique.objects.update_or_create(
            boutique=boutique, defaults={'nom_boutique': nom, 'telephone': '00 00 00 00'},
        )
        unites = {}
        for nom_unite, facteur in UNITES_PAR_DEFAUT:
            unites[nom_unite], _ = UniteVente.objects.get_or_create(
                boutique=boutique, nom=nom_unite,
                defaults={'facteur_conversion': facteur, 'est_systeme': True},
            )
        categories = {}
        for nom_produit, nom_categorie, achat, unitaire, douzaine, stock, minimum in produits:
            if nom_categorie not in categories:
                categories[nom_categorie] = Categorie.objects.create(boutique=boutique, nom=nom_categorie)
            produit = Produit.objects.create(
                boutique=boutique, nom=nom_produit, categorie=categories[nom_categorie],
                prix_achat=Decimal(achat), prix_unitaire=Decimal(unitaire), prix_douzaine=Decimal(douzaine),
                quantite_en_stock=stock, stock_minimum=minimum,
            )
            ProduitPrix.objects.create(produit=produit, unite=unites['Unité'], prix=Decimal(unitaire))
            ProduitPrix.objects.create(produit=produit, unite=unites['Douzaine'], prix=Decimal(douzaine))
        return boutique

    def _vendre(self, client, boutique, ventes):
        produits = {p.nom: p for p in Produit.objects.filter(boutique=boutique)}
        for mode, lignes in ventes:
            payload = {
                'mode_paiement': mode,
                'lignes': [
                    {
                        'produit': produits[nom].id, 'quantite': quantite,
                        'type_vente': 'UNITE', 'prix_applique': str(produits[nom].prix_unitaire),
                    }
                    for nom, quantite in lignes
                ],
            }
            # Vente comptant payée au franc près, comme le montant reçu que
            # saisit le vendeur ; le serveur recalcule et vérifie le reste.
            payload['montant_paye'] = str(sum(
                produits[nom].prix_unitaire * quantite for nom, quantite in lignes
            ))
            reponse = client.post(
                '/api/ventes/', payload, format='json', HTTP_X_BOUTIQUE_ACTIVE=str(boutique.id),
            )
            if reponse.status_code != 201:
                raise CommandError(f"Vente de démonstration refusée ({reponse.status_code}) : {reponse.data}")
