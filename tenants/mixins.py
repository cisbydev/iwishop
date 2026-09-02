from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from .profil import boutique_de

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

        return boutique_de(request)

    def _verifier_acces(self, boutique):
        if not boutique.actif:
            raise PermissionDenied("Cette boutique a été désactivée.")
        if not boutique.abonnement_valide():
            raise PermissionDenied("Abonnement expiré. Merci de renouveler votre abonnement.")

    def get_queryset(self):
        # _verifier_acces() (boutique désactivée/abonnement expiré) n'est
        # PAS appelé ici : une boutique désactivée ou dont l'abonnement a
        # expiré doit rester lisible (consulter son historique, ses
        # rapports) - seules les écritures sont bloquées. Comme get_object()
        # (retrieve/update/partial_update/destroy) passe par get_queryset(),
        # tout chemin d'écriture qui ne va pas explicitement par
        # perform_create/perform_update/perform_destroy ci-dessous (une
        # action @action personnalisée, par ex.) doit appeler
        # _verifier_acces() lui-même - sans quoi elle resterait accessible
        # boutique désactivée/abonnement expiré (voir Achat/Vente/Depense
        # .annuler(), Employe.reactiver()/destroy()).
        boutique = self._boutique_effective()
        return super().get_queryset().filter(**{self.boutique_lookup: boutique})

    def perform_create(self, serializer):
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save(boutique=boutique)

    def perform_update(self, serializer):
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        serializer.save()

    def perform_destroy(self, instance):
        boutique = self._boutique_effective()
        self._verifier_acces(boutique)
        instance.delete()
