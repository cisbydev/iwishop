from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChangePasswordView,
    DiagnosticCacheView,
    DiagnosticThrottleKeysView,
    EmployeViewSet,
    MeView,
)

router = DefaultRouter()
router.register(r'employes', EmployeViewSet, basename='employes')

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    # [DEBUG-THROTTLE] Temporaire - cf. DiagnosticCacheView /
    # DiagnosticThrottleKeysView, à retirer une fois le diagnostic du
    # throttling en prod confirmé.
    path('diagnostic-cache/', DiagnosticCacheView.as_view(), name='diagnostic-cache'),
    path('diagnostic-throttle/', DiagnosticThrottleKeysView.as_view(), name='diagnostic-throttle'),
    path('', include(router.urls)),
]
