from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class Boutique(models.Model):
    nom = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nom

    def abonnement_valide(self):
        """Pas d'abonnement configuré = accès autorisé (boutiques existantes/test)."""
        if not hasattr(self, 'abonnement'):
            return True
        return self.abonnement.date_fin >= timezone.localdate()

    def est_accessible(self):
        return self.actif and self.abonnement_valide()

class Profil(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profil')
    boutique = models.ForeignKey(Boutique, on_delete=models.CASCADE, related_name='membres')
    est_proprietaire = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} - {self.boutique.nom}"

class DemandeAcces(models.Model):
    STATUTS = (
        ('EN_ATTENTE', 'En attente'),
        ('APPROUVEE', 'Approuvée'),
        ('REJETEE', 'Rejetée'),
    )
    nom_contact = models.CharField(max_length=150)
    email = models.EmailField()
    telephone = models.CharField(max_length=30, blank=True)
    nom_boutique_souhaite = models.CharField(max_length=150)
    statut = models.CharField(max_length=20, choices=STATUTS, default='EN_ATTENTE')
    date_demande = models.DateTimeField(auto_now_add=True)
    notes_admin = models.TextField(blank=True)

    def __str__(self):
        return f"{self.nom_boutique_souhaite} ({self.statut})"

class AccesSupport(models.Model):
    admin = models.ForeignKey(User, on_delete=models.CASCADE, related_name='acces_support')
    boutique = models.ForeignKey(Boutique, on_delete=models.CASCADE, related_name='acces_support')
    date_acces = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.admin.username} a consulté {self.boutique.nom} le {self.date_acces.strftime('%d/%m/%Y %H:%M')}"

    class Meta:
        ordering = ['-date_acces']

class FormuleAbonnement(models.Model):
    nom = models.CharField(max_length=100)
    duree_jours = models.PositiveIntegerField()
    prix = models.DecimalField(max_digits=10, decimal_places=2)
    actif = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.nom} ({self.prix} FCFA)"

class Abonnement(models.Model):
    STATUTS = (
        ('ACTIF', 'Actif'),
        ('EXPIRE', 'Expiré'),
        ('EN_ATTENTE', 'En attente'),
    )
    boutique = models.OneToOneField(Boutique, on_delete=models.CASCADE, related_name='abonnement')
    formule = models.ForeignKey(FormuleAbonnement, on_delete=models.PROTECT)
    date_debut = models.DateField()
    date_fin = models.DateField()
    statut = models.CharField(max_length=20, choices=STATUTS, default='ACTIF')
    alerte_envoyee = models.BooleanField(default=False)
    reference_paiement = models.CharField(max_length=100, blank=True, default='')

    def __str__(self):
        return f"{self.boutique.nom} - {self.formule.nom} (jusqu'au {self.date_fin.strftime('%d/%m/%Y')})"
