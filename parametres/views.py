import traceback
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsOwner
from tenants.mixins import BoutiqueScopedMixin
from .models import ParametresBoutique
from .serializers import ParametresBoutiqueSerializer

class ParametresBoutiqueView(BoutiqueScopedMixin, generics.RetrieveUpdateAPIView):
    queryset = ParametresBoutique.objects.all()
    serializer_class = ParametresBoutiqueSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Modifier la configuration de la boutique est réservé au
        # propriétaire (P1 point 6 - RBAC) ; la lecture reste ouverte à
        # tout employé. Pas de `.action` ici (vue générique, pas un
        # ViewSet) : on distingue sur la méthode HTTP.
        if self.request.method in ('PUT', 'PATCH'):
            return [IsAuthenticated(), IsOwner()]
        return super().get_permissions()

    def get_object(self):
        # get_object() est surchargé (pas de pk dans l'URL, une seule
        # ressource par boutique) : le passage par get_queryset() du mixin
        # est donc court-circuité. _verifier_acces() (boutique désactivée/
        # abonnement expiré) n'est appelée que pour les écritures (PUT/
        # PATCH, même distinction que get_permissions() ci-dessus) : la
        # lecture des paramètres doit rester possible boutique désactivée/
        # abonnement expiré, comme les autres vues en lecture seule
        # (cf. tenants.mixins.BoutiqueScopedMixin.get_queryset()).
        boutique = self._boutique_effective()
        if self.request.method in ('PUT', 'PATCH'):
            self._verifier_acces(boutique)
        obj, created = ParametresBoutique.objects.get_or_create(boutique=boutique)
        return obj

    # [DEBUG-R2] Temporaire : diagnostic du 500 sur PATCH (upload logo) en
    # prod, faute d'accès au Shell Render sur ce plan. print() contourne le
    # LOGGING par défaut de Django (handler console filtré par
    # require_debug_true, donc muet quand DEBUG=False) - Render capture le
    # stdout du process quoi qu'il arrive. Ne modifie pas la réponse envoyée
    # au client (re-raise) : aucun changement de comportement. A retirer une
    # fois le diagnostic confirmé.
    def perform_update(self, serializer):
        try:
            serializer.save()
        except Exception:
            print("[DEBUG-R2] Echec serializer.save() sur ParametresBoutique :", flush=True)
            print(traceback.format_exc(), flush=True)
            raise