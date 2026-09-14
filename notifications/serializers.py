from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'type_notification', 'message', 'produit', 'vente',
            'destinataire_role', 'date_creation', 'lue',
        ]
        # Consultation et marquage "lue" uniquement : la création vient du
        # code métier (stock bas / dette en retard), jamais de l'API.
        read_only_fields = fields
