from django.urls import path
from .views import (
    DemandeAccesCreateView, DemandeAccesListView, ApprouverDemandeView, RejeterDemandeView,
    RechercherUtilisateurView, BoutiqueListView, ToggleBoutiqueActifView, DemarrerVueSupportView,
    MesAccesSupportView, MesBoutiquesView, MonAbonnementView, FormuleAbonnementListView,
    CreerPaiementView, PaiementAbonnementStatutView, PaydunyaWebhookView,
)

urlpatterns = [
    path('demande-acces/', DemandeAccesCreateView.as_view(), name='demande-acces-create'),
    path('demandes/', DemandeAccesListView.as_view(), name='demandes-list'),
    path('demandes/<int:demande_id>/approuver/', ApprouverDemandeView.as_view(), name='demande-approuver'),
    path('demandes/<int:demande_id>/rejeter/', RejeterDemandeView.as_view(), name='demande-rejeter'),
    path('utilisateurs/rechercher/', RechercherUtilisateurView.as_view(), name='utilisateur-rechercher'),
    path('boutiques/', BoutiqueListView.as_view(), name='boutiques-list'),
    path('boutiques/<int:boutique_id>/toggle-actif/', ToggleBoutiqueActifView.as_view(), name='boutique-toggle-actif'),
    path('boutiques/<int:boutique_id>/vue-support/', DemarrerVueSupportView.as_view(), name='vue-support'),
    path('mes-acces-support/', MesAccesSupportView.as_view(), name='mes-acces-support'),
    path('mes-boutiques/', MesBoutiquesView.as_view(), name='mes-boutiques'),
    path('mon-abonnement/', MonAbonnementView.as_view(), name='mon-abonnement'),
    path('formules-abonnement/', FormuleAbonnementListView.as_view(), name='formules-abonnement'),
    path('creer-paiement/', CreerPaiementView.as_view(), name='creer-paiement'),
    path('paiements-abonnement/<str:paiement_id>/', PaiementAbonnementStatutView.as_view(), name='paiement-abonnement-statut'),
    path('paydunya-webhook/', PaydunyaWebhookView.as_view(), name='paydunya-webhook'),
]
