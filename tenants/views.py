import logging
import secrets
from django.utils import timezone
from django.utils.text import slugify
from django.contrib.auth.models import User
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from products.models import UniteVente, UNITES_PAR_DEFAUT
from .models import DemandeAcces, Boutique, Profil, AccesSupport, Abonnement, FormuleAbonnement, PaiementAbonnement
from .serializers import DemandeAccesSerializer, BoutiqueSerializer, AccesSupportSerializer, FormuleAbonnementSerializer
from .permissions import IsPlatformOwner
from .emails import envoyer_identifiants_email, notifier_nouvelle_demande, envoyer_alerte_expiration_email
from . import paydunya
from .services import confirmer_paiement

logger = logging.getLogger(__name__)

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

        for nom, facteur in UNITES_PAR_DEFAUT:
            UniteVente.objects.get_or_create(
                boutique=boutique, nom=nom,
                defaults={'facteur_conversion': facteur, 'est_systeme': True}
            )

        # Essai gratuit de 14 jours pour toute nouvelle boutique créée via ce
        # flux client. Les boutiques créées manuellement depuis l'admin
        # Django (tests, cas particuliers) restent volontairement exemptées
        # (pas d'Abonnement créé => fallback abonnement_valide()=True).
        formule_essai = FormuleAbonnement.objects.get(nom='Essai gratuit')
        aujourdhui = timezone.localdate()
        Abonnement.objects.create(
            boutique=boutique,
            formule=formule_essai,
            date_debut=aujourdhui,
            date_fin=aujourdhui + timezone.timedelta(days=formule_essai.duree_jours),
            statut='ACTIF',
            reference_paiement='ESSAI_GRATUIT',
        )

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

class BoutiqueListView(generics.ListAPIView):
    """Liste toutes les boutiques, réservée à moi (admin plateforme)."""
    queryset = Boutique.objects.all().order_by('-date_creation')
    serializer_class = BoutiqueSerializer
    permission_classes = [IsPlatformOwner]

class ToggleBoutiqueActifView(APIView):
    """Active/désactive une boutique. Réservée à moi."""
    permission_classes = [IsPlatformOwner]

    def post(self, request, boutique_id, *args, **kwargs):
        try:
            boutique = Boutique.objects.get(pk=boutique_id)
        except Boutique.DoesNotExist:
            return Response({"detail": "Boutique introuvable."}, status=status.HTTP_404_NOT_FOUND)

        boutique.actif = not boutique.actif
        boutique.save()

        return Response({
            "id": boutique.id,
            "nom": boutique.nom,
            "actif": boutique.actif,
            "detail": f"Boutique {'réactivée' if boutique.actif else 'désactivée'}."
        }, status=status.HTTP_200_OK)

class DemarrerVueSupportView(APIView):
    """Démarre une session de consultation en lecture seule d'une boutique. Réservée à moi."""
    permission_classes = [IsPlatformOwner]

    def post(self, request, boutique_id, *args, **kwargs):
        try:
            boutique = Boutique.objects.get(pk=boutique_id)
        except Boutique.DoesNotExist:
            return Response({"detail": "Boutique introuvable."}, status=status.HTTP_404_NOT_FOUND)

        AccesSupport.objects.create(admin=request.user, boutique=boutique)

        return Response({
            "detail": f"Session de consultation démarrée pour '{boutique.nom}'. Lecture seule.",
            "boutique_id": boutique.id,
            "boutique_nom": boutique.nom,
        }, status=status.HTTP_200_OK)

class MesAccesSupportView(generics.ListAPIView):
    """Historique des consultations Vue Support subies par SA PROPRE boutique."""
    serializer_class = AccesSupportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        boutique = self.request.user.profil.boutique
        return AccesSupport.objects.filter(boutique=boutique).order_by('-date_acces')

class FormuleAbonnementListView(generics.ListAPIView):
    """Liste des formules d'abonnement actives, ouverte à tout utilisateur connecté."""
    queryset = FormuleAbonnement.objects.filter(actif=True)
    serializer_class = FormuleAbonnementSerializer
    permission_classes = [IsAuthenticated]

class MonAbonnementView(APIView):
    """Statut de l'abonnement de la boutique connectée.

    Sert aussi de déclencheur pour l'alerte email J-3 (pas de job planifié
    dans cette architecture) : chaque appel vérifie si l'échéance approche
    et envoie l'email une seule fois, grâce à un update conditionnel
    (compare-and-set) sur alerte_envoyee qui protège contre un double appel
    concurrent (StrictMode, deux onglets, etc.).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        boutique = request.user.profil.boutique
        info = boutique.info_abonnement()

        if not info["a_abonnement"]:
            return Response({
                "a_abonnement": False,
                "formule": None,
                "date_debut": None,
                "date_fin": None,
                "statut": None,
                "abonnement_valide": True,
                "jours_restants": None,
            })

        abonnement = boutique.abonnement
        jours_restants = info["jours_restants"]

        if jours_restants <= 3 and not abonnement.alerte_envoyee:
            maj = Abonnement.objects.filter(pk=abonnement.pk, alerte_envoyee=False).update(alerte_envoyee=True)
            if maj:
                proprietaire = Profil.objects.filter(
                    boutique=boutique, est_proprietaire=True
                ).select_related('user').first()
                if proprietaire and proprietaire.user.email:
                    envoyer_alerte_expiration_email(
                        destinataire_email=proprietaire.user.email,
                        destinataire_nom=proprietaire.user.username,
                        boutique_nom=boutique.nom,
                        jours_restants=jours_restants,
                        date_fin=abonnement.date_fin,
                    )

        return Response({
            "a_abonnement": True,
            "formule": abonnement.formule.nom,
            "date_debut": abonnement.date_debut,
            "date_fin": info["date_fin"],
            "statut": info["statut"],
            "abonnement_valide": boutique.abonnement_valide(),
            "jours_restants": jours_restants,
        })

FENETRE_REUTILISATION_PAIEMENT = timezone.timedelta(minutes=15)


class CreerPaiementView(APIView):
    """Crée une facture PayDunya pour la formule choisie et renvoie l'URL de
    paiement vers laquelle rediriger le frontend.

    Réutilise un paiement EN_ATTENTE récent pour la même boutique/formule
    plutôt que d'en recréer un (double-clic, rechargement de page, deux
    onglets) - évite de multiplier les factures PayDunya pour le même achat."""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        formule_id = request.data.get('formule_id')
        try:
            formule = FormuleAbonnement.objects.get(pk=formule_id, actif=True)
        except (FormuleAbonnement.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Formule introuvable."}, status=status.HTTP_404_NOT_FOUND)

        boutique = request.user.profil.boutique

        paiement_recent = PaiementAbonnement.objects.filter(
            boutique=boutique,
            formule=formule,
            statut='EN_ATTENTE',
            date_creation__gte=timezone.now() - FENETRE_REUTILISATION_PAIEMENT,
        ).exclude(url_paiement='').order_by('-date_creation').first()

        if paiement_recent:
            return Response({"url_paiement": paiement_recent.url_paiement})

        paiement = PaiementAbonnement.objects.create(boutique=boutique, formule=formule)

        ok, resultat = paydunya.creer_facture(paiement)
        if not ok:
            paiement.statut = 'ECHEC'
            paiement.save(update_fields=['statut'])
            return Response(
                {"detail": "Impossible de créer le paiement pour le moment."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        paiement.invoice_token = resultat['token']
        paiement.url_paiement = resultat['url']
        paiement.save(update_fields=['invoice_token', 'url_paiement'])

        return Response({"url_paiement": resultat['url']})

class PaydunyaWebhookView(APIView):
    """Réception de l'IPN PayDunya. PUBLIC (PayDunya ne peut pas s'authentifier
    avec un JWT utilisateur) - la sécurité repose sur : 1) le hash reçu, un
    premier filtre rapide, et surtout 2) un rappel serveur-à-serveur vers
    PayDunya (confirmer_facture) qui seul fait foi pour créditer un abonnement.
    Le contenu du POST entrant n'est JAMAIS utilisé pour la décision métier."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        hash_recu = request.POST.get('data[hash]', '')
        if not paydunya.hash_valide(hash_recu):
            logger.warning("Webhook PayDunya rejeté : hash invalide.")
            return Response(status=status.HTTP_400_BAD_REQUEST)

        token = request.POST.get('data[invoice][token]', '')
        paiement_id = request.POST.get('data[custom_data][paiement_id]', '')

        if not token or not paiement_id:
            logger.warning("Webhook PayDunya rejeté : token ou paiement_id manquant.")
            return Response(status=status.HTTP_400_BAD_REQUEST)

        try:
            statut_reel = paydunya.confirmer_facture(token)
        except paydunya.PaydunyaVerificationError as e:
            logger.error("Webhook PayDunya : vérification impossible pour le token %s : %s", token, e)
            return Response(status=status.HTTP_502_BAD_GATEWAY)

        if statut_reel != 'completed':
            # Accusé de réception : PENDING/CANCELLED ne sont pas des erreurs,
            # juste rien à créditer pour l'instant.
            return Response(status=status.HTTP_200_OK)

        try:
            paiement = PaiementAbonnement.objects.get(pk=paiement_id, invoice_token=token)
        except (PaiementAbonnement.DoesNotExist, ValueError):
            logger.error("Webhook PayDunya : paiement introuvable pour id=%s token=%s", paiement_id, token)
            return Response(status=status.HTTP_404_NOT_FOUND)

        confirmer_paiement(paiement.id)

        return Response(status=status.HTTP_200_OK)
