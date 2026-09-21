from datetime import timedelta

from django.utils import timezone

from parametres.models import ParametresBoutique
from sales.models import Vente
from tenants.models import Boutique
from .models import DestinataireNotification, Notification, TypeNotification


def verifier_stock_bas(produit):
    """Appelée juste après une mutation de produit.quantite_en_stock, dans
    la même transaction que cette mutation. Ne crée jamais de doublon :
    une notification STOCK_BAS non lue existante pour ce produit couvre
    déjà l'alerte, peu importe de combien le stock s'enfonce encore sous
    le seuil (anti-spam). Si le stock est remonté au-dessus du seuil
    (réassort), les notifications STOCK_BAS non lues n'ont plus lieu
    d'être et sont marquées lues automatiquement."""
    notifications_non_lues = Notification.objects.filter(
        produit=produit, type_notification=TypeNotification.STOCK_BAS, lue=False,
    )

    if produit.quantite_en_stock > produit.stock_minimum:
        notifications_non_lues.update(lue=True)
        return

    if notifications_non_lues.exists():
        return

    Notification.objects.create(
        boutique_id=produit.boutique_id,
        type_notification=TypeNotification.STOCK_BAS,
        message=(
            f"Stock bas : {produit.nom} ({produit.quantite_en_stock} restant, "
            f"seuil {produit.stock_minimum})"
        ),
        produit=produit,
        destinataire_role=DestinataireNotification.TOUS,
    )


def verifier_dettes_en_retard():
    """Parcourt toutes les boutiques actives (pensée pour un déclenchement
    quotidien externe, cf. management command) : crée une notification
    DETTE_RETARD par vente à crédit en retard, une seule fois tant qu'elle
    reste non lue (anti-spam - sinon une nouvelle notification apparaîtrait
    chaque jour pour la même dette tant que le client n'a pas payé). Résout
    aussi automatiquement les notifications devenues obsolètes (vente
    soldée entre-temps), même logique que verifier_stock_bas().

    Le seuil de retard est propre à chaque boutique (ParametresBoutique.
    seuil_dette_retard_jours) plutôt qu'une constante globale - d'où
    l'itération boutique par boutique au lieu d'un unique filtre Vente.

    Retourne {"creees": int, "resolues": int} pour le résumé du command."""
    notifications_creees = 0

    for boutique in Boutique.objects.filter(actif=True):
        # get_or_create comme ParametresBoutiqueView.get_object() : une
        # boutique n'a pas forcément encore de ParametresBoutique créé
        # explicitement (default=7 s'applique alors, même seuil qu'avant).
        parametres, _ = ParametresBoutique.objects.get_or_create(boutique=boutique)
        seuil_retard = timezone.now() - timedelta(days=parametres.seuil_dette_retard_jours)

        # ANNULEE exclue : une vente annulée n'est plus une dette réelle, même
        # principe que sales.services.credit.dette_totale_client() et
        # ClientViewSet.avec_dette() (audit de cohérence, étape 3).
        ventes_en_retard = Vente.objects.filter(
            boutique=boutique, montant_du__gt=0, date_vente__lt=seuil_retard, statut='VALIDEE',
        ).select_related('client_credit')

        for vente in ventes_en_retard:
            deja_notifiee = Notification.objects.filter(
                vente=vente, type_notification=TypeNotification.DETTE_RETARD, lue=False,
            ).exists()
            if deja_notifiee:
                continue

            jours = (timezone.now() - vente.date_vente).days
            Notification.objects.create(
                boutique_id=vente.boutique_id,
                type_notification=TypeNotification.DETTE_RETARD,
                message=(
                    f"Dette en retard : {vente.client_credit.nom} doit "
                    f"{vente.montant_du} FCFA depuis {jours} jours"
                ),
                vente=vente,
                destinataire_role=DestinataireNotification.PROPRIETAIRE,
            )
            notifications_creees += 1

    notifications_resolues = Notification.objects.filter(
        type_notification=TypeNotification.DETTE_RETARD, lue=False, vente__montant_du=0,
    ).update(lue=True)

    return {"creees": notifications_creees, "resolues": notifications_resolues}
