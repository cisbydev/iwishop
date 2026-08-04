from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DepenseViewSet

router = DefaultRouter()
router.register(r'', DepenseViewSet, basename='depenses')

urlpatterns = [
    path('', include(router.urls)),
]