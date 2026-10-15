from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from parametres.services import parametres_boutique
from tenants.models import Boutique

from ..models import Facture, Vente


def numero_facture(annee, sequence):
    return f"F-{annee}-{sequence:04d}"


@transaction.atomic
def emettre_facture(vente, utilisateur):
    """Émet la facture d'une vente, ou renvoie celle qui existe déjà.

    Retourne (facture, creee). Une vente a au plus une facture : un second
    appel ne consomme aucun numéro.

    Verrous, toujours dans cet ordre : la vente, puis la boutique.
    - La vente (FOR UPDATE, comme VenteViewSet.annuler et les
      remboursements) : une annulation concurrente est committée avant la
      lecture du statut, et deux émissions sur la même vente passent l'une
      après l'autre (la seconde trouve la facture de la première).
    - La boutique : met en file toutes les émissions d'une boutique, pour
      que le numéro (plus grande séquence de l'année + 1) ne soit jamais
      attribué deux fois. NO KEY UPDATE suffit, comme pour le fournisseur
      d'un achat : il entre en conflit avec lui-même et avec le FOR UPDATE
      de CreerPaiementView, mais pas avec le FOR KEY SHARE que prennent au
      commit les clés étrangères des autres écritures de la boutique
      (ventes, mouvements de stock...), qui n'ont donc pas à l'attendre.
    Aucun autre code ne verrouille la boutique puis une vente : pas
    d'interblocage. Le numéro n'existe que si la transaction réussit et
    aucune facture n'est supprimée : pas de trou."""
    vente = Vente.objects.select_for_update().get(pk=vente.pk)

    facture_existante = Facture.objects.filter(vente=vente).first()
    if facture_existante is not None:
        return facture_existante, False

    if vente.statut == 'ANNULEE':
        raise ValidationError("Impossible d'émettre une facture pour une vente annulée.")

    boutique = Boutique.objects.select_for_update(no_key=True).get(pk=vente.boutique_id)

    annee = timezone.localdate().year
    derniere_sequence = Facture.objects.filter(boutique=boutique, annee=annee).aggregate(
        derniere=Max('sequence')
    )['derniere'] or 0
    sequence = derniere_sequence + 1

    parametres = parametres_boutique(boutique)
    client_credit = vente.client_credit
    if client_credit is not None:
        nom_client, telephone_client = client_credit.nom, client_credit.telephone
    else:
        nom_client, telephone_client = vente.client or '', ''

    lignes = [
        {
            'produit': ligne.produit.nom,
            'unite': ligne.unite.nom,
            'quantite': ligne.quantite,
            'prix_unitaire': str(ligne.prix_applique),
            'sous_total': str(ligne.sous_total),
        }
        for ligne in vente.lignes.select_related('produit', 'unite').order_by('pk')
    ]

    facture = Facture.objects.create(
        boutique=boutique,
        vente=vente,
        annee=annee,
        sequence=sequence,
        numero=numero_facture(annee, sequence),
        emise_par=utilisateur,
        # Même nom que les exports PDF des rapports (Boutique.nom).
        nom_boutique=boutique.nom,
        adresse_boutique=parametres.adresse or '',
        telephone_boutique=parametres.telephone or '',
        logo_boutique=parametres.logo.name if parametres.logo else '',
        nom_client=nom_client,
        telephone_client=telephone_client,
        lignes=lignes,
        devise=parametres.devise,
    )
    return facture, True
