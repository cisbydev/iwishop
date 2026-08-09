import secrets
from django.utils.text import slugify
from django.contrib.auth.models import User
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import DemandeAcces, Boutique, Profil
from .serializers import DemandeAccesSerializer
from .permissions import IsPlatformOwner
from .emails import envoyer_identifiants_email, notifier_nouvelle_demande

class DemandeAccesCreateView(generics.CreateAPIView):
    """Formulaire public : n'importe qui peut soumettre une demande."""
    queryset = DemandeAcces.objects.all()
    serializer_class = DemandeAccesSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        demande = serializer.save()
        # On n'échoue jamais la création de la demande si l'email de
        # notification échoue - c'est secondaire, pas bloquant.
        notifier_nouvelle_demande(
            nom_contact=demande.nom_contact,
            email_contact=demande.email,
            nom_boutique_souhaite=demande.nom_boutique_souhaite,
            telephone=demande.telephone,
        )

class DemandeAccesListView(generics.ListAPIView):
    """Liste des demandes, réservée à moi (admin plateforme)."""
    queryset = DemandeAcces.objects.all().order_by('-date_demande')
    serializer_class = DemandeAccesSerializer
    permission_classes = [IsPlatformOwner]

class ApprouverDemandeView(APIView):
    """Approuve une demande : crée Boutique + User + Profil propriétaire."""
    permission_classes = [IsPlatformOwner]

    def post(self, request, demande_id, *args, **kwargs):
        try:
            demande = DemandeAcces.objects.get(pk=demande_id, statut='EN_ATTENTE')
        except DemandeAcces.DoesNotExist:
            return Response(
                {"detail": "Demande introuvable ou déjà traitée."},
                status=status.HTTP_404_NOT_FOUND
            )

        slug_base = slugify(demande.nom_boutique_souhaite)
        slug = slug_base
        compteur = 1
        while Boutique.objects.filter(slug=slug).exists():
            slug = f"{slug_base}-{compteur}"
            compteur += 1

        boutique = Boutique.objects.create(nom=demande.nom_boutique_souhaite, slug=slug)

        username_base = demande.email.split('@')[0]
        username = username_base
        compteur = 1
        while User.objects.filter(username=username).exists():
            username = f"{username_base}{compteur}"
            compteur += 1

        mot_de_passe_temporaire = secrets.token_urlsafe(8)
        user = User.objects.create(username=username, email=demande.email)
        user.set_password(mot_de_passe_temporaire)
        user.save()

        Profil.objects.create(user=user, boutique=boutique, est_proprietaire=True)

        email_envoye, erreur_email = envoyer_identifiants_email(
            destinataire_email=demande.email,
            destinataire_nom=demande.nom_contact,
            username=username,
            mot_de_passe=mot_de_passe_temporaire,
            boutique_nom=boutique.nom,
        )

        demande.statut = 'APPROUVEE'
        demande.save()

        return Response({
            "detail": "Boutique créée avec succès.",
            "username": username,
            "mot_de_passe_temporaire": mot_de_passe_temporaire,
            "boutique": boutique.nom,
            "email_envoye": email_envoye,
            "erreur_email": erreur_email,
            "avertissement": "Transmets ces identifiants au client de façon sécurisée si l'email n'a pas pu être envoyé. Ce mot de passe ne sera plus jamais affiché."
        }, status=status.HTTP_201_CREATED)

class RejeterDemandeView(APIView):
    permission_classes = [IsPlatformOwner]

    def post(self, request, demande_id, *args, **kwargs):
        try:
            demande = DemandeAcces.objects.get(pk=demande_id, statut='EN_ATTENTE')
        except DemandeAcces.DoesNotExist:
            return Response({"detail": "Demande introuvable ou déjà traitée."}, status=status.HTTP_404_NOT_FOUND)
        demande.statut = 'REJETEE'
        demande.save()
        return Response({"detail": "Demande rejetée."}, status=status.HTTP_200_OK)
