from django.urls import path
from .views import (
    ResumeFinancierExportExcelView, ResumeFinancierExportPDFView, ResumeFinancierView,
    VentesDetailleesExportExcelView, VentesDetailleesExportPDFView, VentesDetailleesView,
)

urlpatterns = [
    path('resume-financier/', ResumeFinancierView.as_view(), name='resume-financier'),
    path('resume-financier/export-pdf/', ResumeFinancierExportPDFView.as_view(), name='resume-financier-export-pdf'),
    path(
        'resume-financier/export-excel/', ResumeFinancierExportExcelView.as_view(),
        name='resume-financier-export-excel',
    ),
    path('ventes-detaillees/', VentesDetailleesView.as_view(), name='ventes-detaillees'),
    path(
        'ventes-detaillees/export-pdf/', VentesDetailleesExportPDFView.as_view(),
        name='ventes-detaillees-export-pdf',
    ),
    path(
        'ventes-detaillees/export-excel/', VentesDetailleesExportExcelView.as_view(),
        name='ventes-detaillees-export-excel',
    ),
]
