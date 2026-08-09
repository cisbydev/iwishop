from rest_framework import serializers
from .models import Depense

class DepenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Depense
        fields = '__all__'
        read_only_fields = ['boutique']