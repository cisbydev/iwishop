from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AchatViewSet, PaiementFournisseurViewSet

router = DefaultRouter()
# paiements/ doit être enregistré AVANT AchatViewSet (préfixe vide) : sinon
# "paiements" serait pris pour l'id d'un achat (même piège que
# remboursements/ dans sales/urls.py).
router.register(r'paiements', PaiementFournisseurViewSet, basename='paiements-fournisseur')
router.register(r'', AchatViewSet, basename='achats')

urlpatterns = [
    path('', include(router.urls)),
]  