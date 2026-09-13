from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VenteViewSet, ClientViewSet, RemboursementViewSet

router = DefaultRouter()
# clients/ et remboursements/ doivent être enregistrés AVANT VenteViewSet
# (préfixe r'') : même piège que products/urls.py, la route détail de
# Vente (r'^(?P<pk>[^/.]+)/$') matcherait sinon ces préfixes en les
# prenant pour un pk.
router.register(r'clients', ClientViewSet, basename='clients')
router.register(r'remboursements', RemboursementViewSet, basename='remboursements')
router.register(r'', VenteViewSet, basename='ventes')

urlpatterns = [
    path('', include(router.urls)),
]