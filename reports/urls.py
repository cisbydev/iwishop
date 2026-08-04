from django.urls import path
from .views import ResumeFinancierView

urlpatterns = [
    path('resume-financier/', ResumeFinancierView.as_view(), name='resume-financier'),
]