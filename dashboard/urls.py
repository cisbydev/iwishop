from django.urls import path
from .views import TableauDeBordView

urlpatterns = [
    path('kpis/', TableauDeBordView.as_view(), name='tableau-de-bord-kpis'),
]