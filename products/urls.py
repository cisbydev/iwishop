from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProduitViewSet, UniteVenteViewSet, ProduitPrixViewSet

router = DefaultRouter()
# unites-vente et prix doivent être enregistrés AVANT ProduitViewSet
# (préfixe r'') : la route détail de Produit (r'^(?P<pk>[^/.]+)/$')
# matcherait sinon "unites-vente/"/"prix/" en les prenant pour un pk.
router.register(r'unites-vente', UniteVenteViewSet, basename='unites-vente')
router.register(r'prix', ProduitPrixViewSet, basename='produit-prix')
router.register(r'', ProduitViewSet, basename='produit')

urlpatterns = [
    path('', include(router.urls)),
]