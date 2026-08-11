from django.core.management.base import BaseCommand
from tenants.models import AccesSupport

class Command(BaseCommand):
    help = "Supprime tous les enregistrements AccesSupport (nettoyage ponctuel des données de test)."

    def handle(self, *args, **options):
        count = AccesSupport.objects.count()
        AccesSupport.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f"{count} enregistrement(s) AccesSupport supprimé(s)."))
