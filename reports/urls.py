from django.urls import path
from .views import ResumeFinancierExportExcelView, ResumeFinancierExportPDFView, ResumeFinancierView

urlpatterns = [
    path('resume-financier/', ResumeFinancierView.as_view(), name='resume-financier'),
    path('resume-financier/export-pdf/', ResumeFinancierExportPDFView.as_view(), name='resume-financier-export-pdf'),
    path(
        'resume-financier/export-excel/', ResumeFinancierExportExcelView.as_view(),
        name='resume-financier-export-excel',
    ),
]