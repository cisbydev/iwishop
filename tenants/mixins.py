from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

class BoutiqueScopedMixin:
    # Chemin ORM vers la boutique, pour les modèles sans champ `boutique`
    # direct (ex: ProduitPrix -> 'produit__boutique'). Ne change rien pour
    # les ViewSets existants, tous scopés par un champ direct.
    boutique_lookup = 'boutique'

    def _boutique_effective(self):
        request = self.request

        # Mode Vue Support : uniquement pour le superuser, uniquement
        # en lecture (GET/HEAD/OPTIONS), uniquement si le header est
        # explicitement présent.
        support_boutique_id = request.headers.get('X-Support-Boutique')
        if support_boutique_id and request.user.is_superuser:
            if request.method not in SAFE_METHODS:
                raise PermissionDenied("La Vue Support est en lecture seule.")
            from .models import Boutique
            try:
                return Boutique.objects.get(pk=support_boutique_id)
            except Boutique.DoesNotExist:
                raise PermissionDenied("Boutique de support introuvable.")

        return request.user.profil.boutique

    def _verifier_acces(self, boutique):
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        if not boutique.abonnement_valide():
            raise PermissionDenied("Abonnement expiré. Merci de renouveler votre abonnement.")

    def get_queryset(self):
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        return super().get_queryset().filter(**{self.boutique_lookup: boutique})

    def perform_create(self, serializer):
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save(boutique=boutique)
