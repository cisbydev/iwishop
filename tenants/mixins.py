class BoutiqueScopedMixin:
    def get_queryset(self):
        return super().get_queryset().filter(boutique=self.request.user.profil.boutique)

    def perform_create(self, serializer):
        serializer.save(boutique=self.request.user.profil.boutique)
