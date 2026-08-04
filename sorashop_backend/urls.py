from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Routes d'authentification JWT
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Routes des modules
    path('api/parametres/', include('parametres.urls')),
    path('api/categories/', include('categories.urls')),
    path('api/fournisseurs/', include('suppliers.urls')),
    path('api/accounts/', include('accounts.urls')), 
    path('api/produits/', include('products.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/achats/', include('purchases.urls')),
    path('api/ventes/', include('sales.urls')),
    path('api/depenses/', include('expenses.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/dashboard/', include('dashboard.urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)