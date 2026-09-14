from django.core.management.base import BaseCommand
from notifications.services import verifier_dettes_en_retard


class Command(BaseCommand):
    help = (
        "Vérifie les ventes à crédit en retard sur toutes les boutiques et crée/résout "
        "les notifications DETTE_RETARD correspondantes. Destiné à un déclenchement "
        "quotidien externe (cron Render)."
    )

    def handle(self, *args, **options):
        resultat = verifier_dettes_en_retard()
        self.stdout.write(self.style.SUCCESS(
            f"{resultat['creees']} notification(s) créée(s), "
            f"{resultat['resolues']} notification(s) résolue(s)."
        ))
