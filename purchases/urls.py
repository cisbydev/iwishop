from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AchatViewSet

router = DefaultRouter()
router.register(r'', AchatViewSet, basename='achats')

urlpatterns = [
    path('', include(router.urls)),
]  