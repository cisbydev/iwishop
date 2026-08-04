from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProduitViewSet

router = DefaultRouter()
router.register(r'', ProduitViewSet, basename='produit')

urlpatterns = [
    path('', include(router.urls)),
]