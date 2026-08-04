from rest_framework import serializers
from .models import ParametresBoutique

class ParametresBoutiqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametresBoutique
        fields = '__all__'