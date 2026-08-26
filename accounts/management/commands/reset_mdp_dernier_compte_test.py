from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = (
        "TEMPORAIRE (diagnostic) - réinitialise le mot de passe du dernier compte "
        "non-superuser créé, pour tester un bug de connexion signalé en prod. "
        "A retirer de build.sh et supprimer après usage."
    )

    def handle(self, *args, **options):
        user = User.objects.filter(is_superuser=False).order_by('-date_joined').first()
        if not user:
            self.stdout.write(self.style.WARNING("Aucun compte non-superuser trouvé."))
            return

        self.stdout.write(self.style.SUCCESS(f"Username exact : {user.username!r}"))
        self.stdout.write(self.style.SUCCESS(f"Email : {user.email!r}"))
        self.stdout.write(self.style.SUCCESS(f"Date de création : {user.date_joined}"))

        user.set_password('TestConnexion123!')
        user.save()
        self.stdout.write(self.style.SUCCESS(
            f"Mot de passe de '{user.username}' réinitialisé à une valeur de test connue."
        ))
