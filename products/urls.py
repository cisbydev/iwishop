from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProduitViewSet, UniteVenteViewSet

router = DefaultRouter()
# unites-vente doit être enregistré AVANT ProduitViewSet (préfixe r'') :
# la route détail de Produit (r'^(?P<pk>[^/.]+)/$') matcherait sinon
# "unites-vente/" en le prenant pour un pk de produit.
router.register(r'unites-vente', UniteVenteViewSet, basename='unites-vente')
router.register(r'', ProduitViewSet, basename='produit')

urlpatterns = [
    path('', include(router.urls)),
]