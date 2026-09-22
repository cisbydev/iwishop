from django.urls import path
from .views import AssistantView

urlpatterns = [
    path('', AssistantView.as_view(), name='assistant'),
]
