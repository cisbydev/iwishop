from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FournisseurViewSet

router = DefaultRouter()
router.register(r'', FournisseurViewSet, basename='fournisseurs')

urlpatterns = [
    path('', include(router.urls)),
]