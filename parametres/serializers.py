from django.core.files.base import ContentFile
from rest_framework import serializers

from products.photos import traiter_photo
from .models import ParametresBoutique

class ParametresBoutiqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametresBoutique
        fields = '__all__'
        # limite_questions_assistant_par_jour : quota réservé à la
        # plateforme (l'assistant est facturé au token), lu mais jamais
        # modifié par le propriétaire.
        read_only_fields = ['boutique', 'limite_questions_assistant_par_jour']

    def validate_logo(self, value):
        # Même traitement que la photo de produit : format lu dans le
        # contenu (un GIF nommé .png est refusé), 40 mégapixels au plus,
        # WebP de 800 px au plus, métadonnées supprimées (position GPS
        # comprise). Le fichier envoyé n'est jamais stocké tel quel.
        # L'ancien logo n'est pas supprimé : les factures le référencent.
        if not value:
            return value
        return ContentFile(traiter_photo(value), name='logo.webp')