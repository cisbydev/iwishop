from django.urls import path
from .views import DemandeAccesCreateView, DemandeAccesListView, ApprouverDemandeView, RejeterDemandeView

urlpatterns = [
    path('demande-acces/', DemandeAccesCreateView.as_view(), name='demande-acces-create'),
    path('demandes/', DemandeAccesListView.as_view(), name='demandes-list'),
    path('demandes/<int:demande_id>/approuver/', ApprouverDemandeView.as_view(), name='demande-approuver'),
    path('demandes/<int:demande_id>/rejeter/', RejeterDemandeView.as_view(), name='demande-rejeter'),
]
