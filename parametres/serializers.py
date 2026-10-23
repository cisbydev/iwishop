from rest_framework import serializers
from .models import ParametresBoutique

class ParametresBoutiqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametresBoutique
        fields = '__all__'
        # limite_questions_assistant_par_jour : quota réservé à la
        # plateforme (l'assistant est facturé au token), lu mais jamais
        # modifié par le propriétaire.
        read_only_fields = ['boutique', 'limite_questions_assistant_par_jour']