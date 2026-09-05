from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChangePasswordView, DiagnosticCacheView, EmployeViewSet, MeView

router = DefaultRouter()
router.register(r'employes', EmployeViewSet, basename='employes')

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    # [DEBUG-THROTTLE] Temporaire - cf. DiagnosticCacheView, à retirer
    # une fois le diagnostic du throttling en prod confirmé.
    path('diagnostic-cache/', DiagnosticCacheView.as_view(), name='diagnostic-cache'),
    path('', include(router.urls)),
]
