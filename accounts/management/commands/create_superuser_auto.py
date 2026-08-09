from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from decouple import config
from tenants.models import Boutique, Profil

class Command(BaseCommand):
    help = "Crée un superuser + sa Boutique + son Profil automatiquement depuis les variables d'environnement, si aucun superuser n'existe déjà."

    def handle(self, *args, **options):
        username = config('DJANGO_SUPERUSER_USERNAME', default=None)
        email = config('DJANGO_SUPERUSER_EMAIL', default='')
        password = config('DJANGO_SUPERUSER_PASSWORD', default=None)

        if not username or not password:
            self.stdout.write(self.style.WARNING(
                "DJANGO_SUPERUSER_USERNAME ou DJANGO_SUPERUSER_PASSWORD non défini, création ignorée."
            ))
            return

        if User.objects.filter(is_superuser=True).exists():
            superuser_sans_profil = User.objects.filter(is_superuser=True, profil__isnull=True).first()
            if superuser_sans_profil:
                boutique, _ = Boutique.objects.get_or_create(
                    slug='ma-boutique',
                    defaults={'nom': 'Ma Boutique', 'actif': True}
                )
                Profil.objects.create(user=superuser_sans_profil, boutique=boutique, est_proprietaire=True)
                self.stdout.write(self.style.SUCCESS(
                    f"Profil manquant créé pour le superuser existant '{superuser_sans_profil.username}'."
                ))
            else:
                self.stdout.write(self.style.SUCCESS("Un superuser existe déjà, création ignorée."))
            return

        user = User.objects.create_superuser(username=username, email=email, password=password)

        boutique, _ = Boutique.objects.get_or_create(
            slug='ma-boutique',
            defaults={'nom': 'Ma Boutique', 'actif': True}
        )
        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=True)

        self.stdout.write(self.style.SUCCESS(
            f"Superuser '{username}' créé avec succès, avec sa Boutique '{boutique.nom}' et son Profil."
        ))
