from django.urls import path
from .views import ResumeFinancierExportPDFView, ResumeFinancierView

urlpatterns = [
    path('resume-financier/', ResumeFinancierView.as_view(), name='resume-financier'),
    path('resume-financier/export-pdf/', ResumeFinancierExportPDFView.as_view(), name='resume-financier-export-pdf'),
]