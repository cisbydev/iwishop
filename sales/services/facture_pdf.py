import logging
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.core.files.storage import default_storage
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from parametres.services import formater_nombre
# Même palette que les exports PDF des rapports.
from reports.views import (
    PDF_BLEU_PRINCIPAL, PDF_GRIS_BORDURE, PDF_GRIS_LIGNE_ALTERNEE, PDF_GRIS_TEXTE, PDF_GRIS_TITRE,
    PDF_ROUGE_NEGATIF,
)

logger = logging.getLogger(__name__)

MARGE = 2 * cm
LARGEUR_UTILE = A4[0] - 2 * MARGE


def _montant(valeur, devise):
    # formater_nombre sépare les milliers par une espace fine insécable
    # (U+202F), absente des polices standard du PDF (Helvetica) : elle
    # deviendrait un carré noir. L'espace insécable (U+00A0) y est.
    texte = formater_nombre(Decimal(valeur)).replace('\u202f', '\u00a0')
    return f"{texte} {devise}".strip()


def _style(nom, taille=9, gras=False, couleur=PDF_GRIS_TITRE, alignement=0, interligne=None):
    return ParagraphStyle(
        nom, fontName='Helvetica-Bold' if gras else 'Helvetica', fontSize=taille,
        leading=interligne or taille * 1.3, textColor=couleur, alignment=alignement,
    )


def _texte(valeur, style):
    # Les données saisies (noms, adresse) passent par escape : un « & » ou
    # un « < » casserait sinon le balisage des Paragraph.
    return Paragraph(escape(str(valeur)), style)


def _logo(chemin):
    """Logo figé à l'émission (chemin dans le stockage). Absent ou
    illisible : PDF sans logo, jamais d'erreur pour l'utilisateur. Toute
    exception est rattrapée, pas seulement OSError : sur R2, un refus
    d'accès arrive en botocore ClientError. Journalisée en ERROR (et non
    WARNING) : c'est le niveau à partir duquel Sentry crée un événement,
    et un logo illisible trahit presque toujours un problème de stockage."""
    if not chemin:
        return None
    try:
        with default_storage.open(chemin, 'rb') as fichier:
            donnees = fichier.read()
        largeur, hauteur = ImageReader(BytesIO(donnees)).getSize()
    except Exception:
        logger.error("Logo de facture illisible : %s", chemin, exc_info=True)
        return None
    if not largeur or not hauteur:
        return None
    hauteur_cible = 1.8 * cm
    return Image(BytesIO(donnees), width=largeur * hauteur_cible / hauteur, height=hauteur_cible)


def _entete(facture):
    bloc_boutique = [_texte(facture.nom_boutique, _style('Boutique', 13, gras=True))]
    if facture.adresse_boutique:
        bloc_boutique.append(_texte(facture.adresse_boutique, _style('Adresse', couleur=PDF_GRIS_TEXTE)))
    if facture.telephone_boutique:
        bloc_boutique.append(
            _texte(f"Tél. : {facture.telephone_boutique}", _style('Telephone', couleur=PDF_GRIS_TEXTE))
        )

    date_emission = timezone.localtime(facture.date_emission).strftime('%d/%m/%Y')
    bloc_facture = [
        Paragraph("FACTURE", _style('Titre', 20, gras=True, couleur=PDF_BLEU_PRINCIPAL, alignement=2)),
        _texte(f"N° {facture.numero}", _style('Numero', 11, gras=True, alignement=2, interligne=16)),
        _texte(f"Date : {date_emission}", _style('Date', couleur=PDF_GRIS_TEXTE, alignement=2)),
    ]

    logo = _logo(facture.logo_boutique)
    if logo is not None:
        cellules, largeurs = [[logo, bloc_boutique, bloc_facture]], [3.2 * cm, 7.3 * cm, LARGEUR_UTILE - 10.5 * cm]
    else:
        cellules, largeurs = [[bloc_boutique, bloc_facture]], [10.5 * cm, LARGEUR_UTILE - 10.5 * cm]
    entete = Table(cellules, colWidths=largeurs)
    entete.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return entete


def _infos_vente(facture, vente):
    date_vente = timezone.localtime(vente.date_vente).strftime('%d/%m/%Y à %H:%M')
    style = _style('Info')
    infos = [_texte(f"Vente n° {vente.numero} du {date_vente}", style)]
    if facture.nom_client:
        client = facture.nom_client
        if facture.telephone_client:
            client += f" (tél. {facture.telephone_client})"
        infos.append(_texte(f"Client : {client}", style))
    return infos


def _tableau_lignes(facture):
    style_cellule = _style('Cellule')
    donnees = [["Produit", "Unité", "Qté", "Prix unitaire", "Montant"]]
    for ligne in facture.lignes:
        donnees.append([
            _texte(ligne['produit'], style_cellule),
            _texte(ligne['unite'], style_cellule),
            str(ligne['quantite']),
            _montant(ligne['prix_unitaire'], facture.devise),
            _montant(ligne['sous_total'], facture.devise),
        ])

    tableau = Table(
        donnees, colWidths=[6.2 * cm, 2.6 * cm, 1.4 * cm, 3.4 * cm, LARGEUR_UTILE - 13.6 * cm], repeatRows=1,
    )
    styles = [
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 0), (-1, 0), PDF_BLEU_PRINCIPAL),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, PDF_GRIS_BORDURE),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for index in range(2, len(donnees), 2):
        styles.append(('BACKGROUND', (0, index), (-1, index), PDF_GRIS_LIGNE_ALTERNEE))
    tableau.setStyle(TableStyle(styles))
    return tableau


def _totaux(facture, vente):
    donnees = [["Total", _montant(vente.montant_total, facture.devise)]]
    if vente.remise:
        donnees.append(["Remise", f"- {_montant(vente.remise, facture.devise)}"])
    donnees.append(["Net à payer", _montant(vente.montant_net, facture.devise)])

    totaux = Table(donnees, colWidths=[4 * cm, 4.5 * cm], hAlign='RIGHT')
    totaux.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, PDF_GRIS_TITRE),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return totaux


def _paiement(facture, vente):
    # Seulement des valeurs qui ne changent plus après la vente : l'acompte
    # (montant_paye) est figé à la création, contrairement à montant_du et
    # statut_paiement, que les remboursements recalculent.
    style = _style('Paiement', 10)
    mode = vente.get_mode_paiement_display()
    if vente.client_credit_id is None:
        return [_texte(f"Mode de paiement : {mode}", style)]
    lignes = [_texte(
        f"Vente à crédit, acompte versé à la vente : {_montant(vente.montant_paye, facture.devise)}", style
    )]
    if vente.montant_paye:
        lignes.append(_texte(f"Mode de paiement de l'acompte : {mode}", style))
    return lignes


def _decor_de_page(facture):
    def dessiner(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(PDF_GRIS_TEXTE)
        canvas.drawString(MARGE, 1.2 * cm, f"Facture {facture.numero}")
        canvas.drawRightString(A4[0] - MARGE, 1.2 * cm, f"Page {doc.page}")
        if facture.est_annulee:
            canvas.setFillColor(PDF_ROUGE_NEGATIF)
            canvas.setFillAlpha(0.25)
            canvas.setFont('Helvetica-Bold', 90)
            canvas.translate(A4[0] / 2, A4[1] / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, -30, "ANNULÉE")
        canvas.restoreState()
    return dessiner


def generer_pdf_facture(facture):
    """PDF A4 de la facture. Ne lit que la facture (copie figée) et sa
    vente (qui ne change plus) : la même facture donne toujours le même
    fichier (invariant=1 : ni date de génération ni identifiant aléatoire),
    sauf le tampon « ANNULÉE » si la vente est annulée depuis.
    pageCompression=0, comme les exports des rapports : les tests lisent
    le texte directement dans le fichier."""
    vente = facture.vente
    tampon = BytesIO()
    doc = SimpleDocTemplate(
        tampon, pagesize=A4, pageCompression=0, invariant=1,
        title=f"Facture {facture.numero}", author=facture.nom_boutique,
        leftMargin=MARGE, rightMargin=MARGE, topMargin=MARGE, bottomMargin=MARGE,
    )

    elements = [_entete(facture)]
    if facture.est_annulee:
        elements += [
            Spacer(1, 0.3 * cm),
            Paragraph("FACTURE ANNULÉE", _style('Annulee', 12, gras=True, couleur=PDF_ROUGE_NEGATIF)),
        ]
    elements += [Spacer(1, 0.8 * cm), *_infos_vente(facture, vente), Spacer(1, 0.5 * cm)]
    elements += [_tableau_lignes(facture), Spacer(1, 0.5 * cm), _totaux(facture, vente), Spacer(1, 0.6 * cm)]
    elements += _paiement(facture, vente)

    decor = _decor_de_page(facture)
    doc.build(elements, onFirstPage=decor, onLaterPages=decor)
    return tampon.getvalue()
