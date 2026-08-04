from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategorieViewSet

router = DefaultRouter()
router.register(r'', CategorieViewSet, basename='categories')

urlpatterns = [
    path('', include(router.urls)),
]