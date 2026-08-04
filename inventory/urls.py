from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MouvementStockViewSet

router = DefaultRouter()
router.register(r'mouvements', MouvementStockViewSet, basename='mouvements-stock')

urlpatterns = [
    path('', include(router.urls)),
]