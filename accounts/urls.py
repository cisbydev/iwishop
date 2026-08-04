from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChangePasswordView, EmployeViewSet, MeView

router = DefaultRouter()
router.register(r'employes', EmployeViewSet, basename='employes')

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('', include(router.urls)),
]
