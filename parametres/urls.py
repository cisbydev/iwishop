from django.urls import path
from .views import ParametresBoutiqueView

urlpatterns = [
    path('', ParametresBoutiqueView.as_view(), name='parametres-boutique'),
]