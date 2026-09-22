from io import BytesIO

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from django.db.models.functions import Coalesce
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from accounts.permissions import IsOwner
from parametres.models import ParametresBoutique
from tenants.mixins import BoutiqueScopedMixin
from sales.models import LigneVente, Vente
from sales.utils import unites_reelles_expr
from purchases.models import Achat
from expenses.models import Depense

# Palette des exports (PDF et Excel) - reprend l'identité visuelle déjà
# utilisée dans Reports.jsx/Dashboard.jsx (bleu Tailwind par défaut), pas
# une palette inventée pour l'occasion. Deux jeux de constantes (reportlab
# attend des colors.HexColor, openpyxl des chaînes hex sans '#') pour les
# mêmes valeurs, gardées côte à côte pour qu'elles restent visiblement
# synchronisées si la palette change un jour.
PDF_BLEU_PRINCIPAL = colors.HexColor('#2563eb')   # blue-600
PDF_GRIS_TITRE = colors.HexColor('#0f172a')       # slate-900
PDF_GRIS_TEXTE = colors.HexColor('#64748b')       # slate-500
PDF_GRIS_LIGNE_ALTERNEE = colors.HexColor('#f1f5f9')  # slate-100
PDF_GRIS_BORDURE = colors.HexColor('#e2e8f0')     # slate-200
PDF_VERT_POSITIF = colors.HexColor('#059669')     # emerald-600
PDF_ROUGE_NEGATIF = colors.HexColor('#dc2626')    # red-600

XLSX_BLEU_PRINCIPAL = '2563EB'      # blue-600
XLSX_GRIS_TITRE = '0F172A'          # slate-900
XLSX_GRIS_TEXTE = '64748B'          # slate-500
XLSX_GRIS_LIGNE_ALTERNEE = 'F1F5F9'  # slate-100
XLSX_GRIS_BORDURE = 'E2E8F0'        # slate-200
XLSX_VERT_POSITIF = '059669'        # emerald-600
XLSX_ROUGE_NEGATIF = 'DC2626'       # red-600


def calculer_resume_financier(boutique, date_debut, date_fin):
    """Calcule le résumé financier (CA, achats, dépenses, bénéfices) d'une
    boutique sur une période optionnelle. Extrait de ResumeFinancierView.get()
    pour être réutilisé par ResumeFinancierExportPDFView - un seul endroit à
    corriger si la logique de calcul change (même principe que le bénéfice
    historique figé, cf. sales.models.LigneVente.prix_achat_unitaire)."""
    # Les ventes annulées ne doivent plus compter dans le CA ni le
    # bénéfice (cf. VenteViewSet.annuler) ; benefice_brut hérite de ce
    # filtre via `vente__in=ventes_qs` plus bas.
    ventes_qs = Vente.objects.filter(boutique=boutique, statut='VALIDEE')
    # Les achats annulés ne doivent plus compter dans le total ni le
    # nombre d'achats (cf. AchatViewSet.annuler).
    achats_qs = Achat.objects.filter(boutique=boutique, statut='VALIDE')
    # Les dépenses annulées ne doivent plus compter dans le total ni le
    # bénéfice net (cf. DepenseViewSet.annuler, P2 point 15).
    depenses_qs = Depense.objects.filter(boutique=boutique, statut='VALIDEE')

    if date_debut and date_fin:
        ventes_qs = ventes_qs.filter(date_vente__date__range=[date_debut, date_fin])
        achats_qs = achats_qs.filter(date_achat__date__range=[date_debut, date_fin])
        depenses_qs = depenses_qs.filter(date_depense__range=[date_debut, date_fin])

    # Chiffre d'affaires total
    chiffre_affaires = ventes_qs.aggregate(total=Sum('montant_net'))['total'] or 0

    # Total des achats
    total_achats = achats_qs.aggregate(total=Sum('montant_total'))['total'] or 0

    # Total des dépenses
    total_depenses = depenses_qs.aggregate(total=Sum('montant'))['total'] or 0

    # --- Bénéfice brut, calculé directement en base de données ---
    # Convertit chaque ligne de vente en nombre d'unités réelles via le
    # facteur de conversion centralisé sur son unité de vente.
    unites_reelles = unites_reelles_expr()

    # Le coût d'achat HISTORIQUE (prix_achat_unitaire x unités réelles)
    # est figé au moment de la vente - jamais Produit.prix_achat courant,
    # qui change à chaque nouvel achat et déformerait rétroactivement le
    # bénéfice d'une vente déjà réalisée (bug P1 corrigé). Le repli sur
    # Produit.prix_achat via Coalesce ne s'applique qu'aux lignes créées
    # avant ce correctif (prix_achat_unitaire NULL, aucun coût
    # historique connu) - limite assumée et documentée, voir
    # sales.models.LigneVente.prix_achat_unitaire.
    cout_historique_expr = ExpressionWrapper(
        Coalesce(F('prix_achat_unitaire'), F('produit__prix_achat')) * unites_reelles,
        output_field=DecimalField(max_digits=14, decimal_places=2)
    )

    cout_historique_total = LigneVente.objects.filter(
        boutique=boutique,
        vente__in=ventes_qs
    ).aggregate(total=Sum(cout_historique_expr))['total'] or 0

    # Le CA est la somme des montants nets : une remise globale diminue
    # donc le bénéfice brut au même titre que le chiffre d'affaires.
    benefice_brut = chiffre_affaires - cout_historique_total

    # Bénéfice net = Bénéfice brut - Total des dépenses
    benefice_net = benefice_brut - total_depenses

    return {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "chiffre_affaires": chiffre_affaires,
        "total_achats": total_achats,
        "total_depenses": total_depenses,
        "benefice_brut": benefice_brut,
        "benefice_net": benefice_net,
        "nombre_ventes": ventes_qs.count(),
        "nombre_achats": achats_qs.count(),
        "nombre_depenses": depenses_qs.count(),
    }


def lister_ventes_detaillees(boutique, date_debut, date_fin):
    """Une entrée par LigneVente des ventes VALIDEE de la période - la
    granularité la plus fine du rapport de ventes (produit vendu, quantité,
    prix), par opposition au résumé agrégé de calculer_resume_financier().

    date_debut/date_fin sont ICI obligatoires (contrairement à
    calculer_resume_financier, où l'absence de bornes veut dire "tout
    l'historique") : une boutique avec des années d'historique produirait
    sinon des dizaines de milliers de lignes en un seul appel.

    select_related sur vente (+ vente__utilisateur, vente__client_credit),
    produit et unite : une seule requête au total, jamais un N+1 par ligne
    (vérifié par un test dédié qui compare le nombre de requêtes avant/après
    ajout de lignes)."""
    lignes = LigneVente.objects.filter(
        boutique=boutique,
        vente__statut='VALIDEE',
        vente__date_vente__date__range=[date_debut, date_fin],
    ).select_related(
        'vente', 'vente__utilisateur', 'vente__client_credit', 'produit', 'unite',
    ).order_by('vente__date_vente')

    return {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "lignes": [
            {
                "date_vente": ligne.vente.date_vente,
                "numero_vente": ligne.vente.numero,
                "vendeur": ligne.vente.utilisateur.username if ligne.vente.utilisateur else "",
                "client": ligne.vente.client_credit.nom if ligne.vente.client_credit_id else (ligne.vente.client or ""),
                "produit": ligne.produit.nom,
                "quantite": ligne.quantite,
                "unite": ligne.unite.nom,
                "prix_applique": ligne.prix_applique,
                "sous_total": ligne.sous_total,
            }
            for ligne in lignes
        ],
    }


def parametres_boutique(boutique):
    """get_or_create comme ParametresBoutiqueView.get_object() : une
    boutique n'a pas forcément encore de ParametresBoutique créé
    explicitement (default="FCFA" s'applique alors). Réutilisé par les
    vues d'export (PDF, Excel) - une seule source pour ce pattern."""
    parametres, _ = ParametresBoutique.objects.get_or_create(boutique=boutique)
    return parametres


def logo_flowable_pdf(parametres):
    # ParametresBoutique.logo est optionnel - et même s'il est renseigné en
    # base, le fichier peut être absent du stockage (même limite documentée
    # pour l'affichage du logo côté frontend, cf. Settings.jsx/
    # logoIndisponible) : jamais d'erreur, juste pas de logo dans le PDF le
    # cas échéant. Partagé par tous les exports PDF des rapports.
    if not parametres.logo:
        return None
    try:
        with parametres.logo.open('rb') as fichier_logo:
            lecteur_image = ImageReader(BytesIO(fichier_logo.read()))
    except (OSError, ValueError):
        return None

    largeur_logo, hauteur_logo = lecteur_image.getSize()
    if not largeur_logo or not hauteur_logo:
        return None

    hauteur_cible = 1.5 * cm
    largeur_cible = largeur_logo * (hauteur_cible / hauteur_logo)
    return Image(lecteur_image, width=largeur_cible, height=hauteur_cible)


def entete_pdf(boutique, parametres, titre, texte_periode, largeur_disponible):
    """En-tête commun à tous les exports PDF des rapports (titre + logo
    optionnel + période) - partagé par ResumeFinancierExportPDFView et
    VentesDetailleesExportPDFView pour rester visuellement identiques."""
    styles = getSampleStyleSheet()
    style_titre = ParagraphStyle(
        'TitreBoutique', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=18, textColor=PDF_GRIS_TITRE,
    )
    style_periode = ParagraphStyle(
        'Periode', parent=styles['Normal'],
        fontName='Helvetica', fontSize=10, textColor=PDF_GRIS_TEXTE, spaceBefore=8,
    )

    bloc_titre = [
        Paragraph(f"{titre} — {boutique.nom}", style_titre),
        Paragraph(texte_periode, style_periode),
    ]

    logo_flowable = logo_flowable_pdf(parametres)
    if logo_flowable is not None:
        largeur_logo_colonne = 3 * cm
        entete = Table(
            [[logo_flowable, bloc_titre]],
            colWidths=[largeur_logo_colonne, largeur_disponible - largeur_logo_colonne],
        )
    else:
        entete = Table([[bloc_titre]], colWidths=[largeur_disponible])

    entete.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return entete


def pied_de_page_pdf(canvas_pdf, doc):
    """Pied de page commun à tous les exports PDF des rapports."""
    canvas_pdf.saveState()
    canvas_pdf.setFont('Helvetica', 8)
    canvas_pdf.setFillColor(PDF_GRIS_TEXTE)
    texte = f"Généré par iwiShop le {timezone.localtime().strftime('%d/%m/%Y %H:%M')}"
    canvas_pdf.drawString(2 * cm, 1.2 * cm, texte)
    canvas_pdf.restoreState()


def texte_periode_rapport(date_debut, date_fin):
    """Texte de la ligne "Période" sous le titre, partagé par tous les
    exports (PDF et Excel) des rapports."""
    if date_debut and date_fin:
        return f"Période : du {date_debut} au {date_fin}"
    return "Période : toutes dates confondues"


def entete_excel(feuille, boutique, titre, texte_periode):
    """En-tête commun à tous les exports Excel des rapports (titre fusionné
    + période) - partagé par ResumeFinancierExportExcelView et
    VentesDetailleesExportExcelView."""
    feuille.merge_cells('A1:B1')
    feuille['A1'] = f"{titre} — {boutique.nom}"
    feuille['A1'].font = Font(bold=True, size=16, color=XLSX_GRIS_TITRE)

    feuille.merge_cells('A2:B2')
    feuille['A2'] = texte_periode
    feuille['A2'].font = Font(size=10, color=XLSX_GRIS_TEXTE)


class ResumeFinancierView(BoutiqueScopedMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Réutilise la même résolution de boutique effective (Vue Support
        # comprise) que les ViewSets scopés, au lieu de dupliquer cette
        # logique ici sans gestion propre de Boutique.DoesNotExist (P2
        # point 14 - Vue Support ad-hoc). Vue en lecture seule : pas
        # d'appel à _verifier_acces() ici - consulter ses rapports doit
        # rester possible boutique désactivée/abonnement expiré, seules
        # les écritures sont bloquées (cf. tenants.mixins.BoutiqueScopedMixin).
        boutique = self._boutique_effective()
        # Récupérer les filtres de date optionnels (?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD)
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')

        return Response(calculer_resume_financier(boutique, date_debut, date_fin))


class ResumeFinancierExportPDFView(BoutiqueScopedMixin, APIView):
    # Export réservé au propriétaire (même principe que VenteViewSet.annuler
    # - une écriture comptable... ici une extraction de données comptables
    # complètes, pas un simple affichage - P1 point 6, RBAC).
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')
        resultat = calculer_resume_financier(boutique, date_debut, date_fin)
        parametres = parametres_boutique(boutique)
        devise = parametres.devise

        response = HttpResponse(content_type='application/pdf')
        nom_fichier = f"resume-financier-{boutique.slug}-{timezone.localdate().isoformat()}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{nom_fichier}"'

        marge = 2 * cm
        # pageCompression=0 : flux non compressé - permet aux tests de
        # vérifier le contenu textuel directement dans response.content
        # sans dépendance supplémentaire d'extraction PDF (pypdf, etc.).
        doc = SimpleDocTemplate(
            response, pagesize=A4, pageCompression=0,
            leftMargin=marge, rightMargin=marge, topMargin=marge, bottomMargin=marge,
        )
        largeur_disponible = A4[0] - 2 * marge
        texte_periode = texte_periode_rapport(resultat['date_debut'], resultat['date_fin'])

        elements = [
            entete_pdf(boutique, parametres, "Résumé financier", texte_periode, largeur_disponible),
            Spacer(1, 0.8 * cm),
            self._tableau_resume(resultat, devise, largeur_disponible),
        ]
        doc.build(elements, onFirstPage=pied_de_page_pdf, onLaterPages=pied_de_page_pdf)
        return response

    def _tableau_resume(self, resultat, devise, largeur_disponible):
        lignes = [
            ("Chiffre d'affaires", f"{resultat['chiffre_affaires']:.2f} {devise}"),
            ("Total des achats", f"{resultat['total_achats']:.2f} {devise}"),
            ("Total des dépenses", f"{resultat['total_depenses']:.2f} {devise}"),
            ("Bénéfice brut", f"{resultat['benefice_brut']:.2f} {devise}"),
            ("Bénéfice net", f"{resultat['benefice_net']:.2f} {devise}"),
            ("Nombre de ventes", str(resultat['nombre_ventes'])),
            ("Nombre d'achats", str(resultat['nombre_achats'])),
            ("Nombre de dépenses", str(resultat['nombre_depenses'])),
        ]
        # Index (dans data_tableau, en-tête compris) de la ligne "Bénéfice
        # net" - le chiffre le plus important du rapport, mis en évidence.
        index_benefice_net = 5

        data_tableau = [["Indicateur", "Valeur"]] + [[libelle, valeur] for libelle, valeur in lignes]
        tableau = Table(data_tableau, colWidths=[largeur_disponible * 0.6, largeur_disponible * 0.4])

        style_tableau = [
            ('BACKGROUND', (0, 0), (-1, 0), PDF_BLEU_PRINCIPAL),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, PDF_GRIS_BORDURE),
            # Lignes alternées (à partir de la première ligne de données,
            # l'en-tête - déjà en bleu - n'entre pas dans l'alternance).
            *[
                ('BACKGROUND', (0, i), (-1, i), PDF_GRIS_LIGNE_ALTERNEE)
                for i in range(1, len(data_tableau)) if i % 2 == 0
            ],
            ('FONTNAME', (0, index_benefice_net), (-1, index_benefice_net), 'Helvetica-Bold'),
            (
                'TEXTCOLOR', (0, index_benefice_net), (-1, index_benefice_net),
                PDF_VERT_POSITIF if resultat['benefice_net'] >= 0 else PDF_ROUGE_NEGATIF,
            ),
        ]
        tableau.setStyle(TableStyle(style_tableau))
        return tableau


class ResumeFinancierExportExcelView(BoutiqueScopedMixin, APIView):
    # Même règle que l'export PDF (ResumeFinancierExportPDFView) : réservé
    # au propriétaire - une extraction de données comptables complètes,
    # pas un simple affichage (P1 point 6, RBAC).
    permission_classes = [IsAuthenticated, IsOwner]

    # Ligne du tableau Indicateur/Valeur (après le titre fusionné en ligne
    # 1, la période en ligne 2, une ligne 3 vide comme respiration - même
    # esprit que le Spacer entre en-tête et tableau côté PDF).
    LIGNE_ENTETE_TABLEAU = 4

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        date_debut = request.GET.get('date_debut')
        date_fin = request.GET.get('date_fin')
        resultat = calculer_resume_financier(boutique, date_debut, date_fin)
        devise = parametres_boutique(boutique).devise

        classeur = Workbook()
        feuille = classeur.active
        feuille.title = "Résumé financier"

        texte_periode = texte_periode_rapport(resultat['date_debut'], resultat['date_fin'])
        entete_excel(feuille, boutique, "Résumé financier", texte_periode)
        self._tableau_resume_excel(feuille, resultat, devise)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        nom_fichier = f"resume-financier-{boutique.slug}-{timezone.localdate().isoformat()}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{nom_fichier}"'
        classeur.save(response)
        return response

    def _tableau_resume_excel(self, feuille, resultat, devise):
        ligne_entete = self.LIGNE_ENTETE_TABLEAU
        bordure = Border(*(Side(style='thin', color=XLSX_GRIS_BORDURE) for _ in range(4)))
        remplissage_entete = PatternFill('solid', fgColor=XLSX_BLEU_PRINCIPAL)
        remplissage_alterne = PatternFill('solid', fgColor=XLSX_GRIS_LIGNE_ALTERNEE)
        # "#,##0.00" pour le séparateur de milliers + 2 décimales, la
        # devise en texte littéral entre guillemets - la cellule reste un
        # vrai nombre (recalculable dans Excel), seul l'affichage change,
        # même principe que formatCurrency() côté frontend.
        format_montant = f'#,##0.00 "{devise}"'

        for colonne, texte in enumerate(("Indicateur", "Valeur"), start=1):
            cellule = feuille.cell(row=ligne_entete, column=colonne, value=texte)
            cellule.font = Font(bold=True, color='FFFFFF')
            cellule.fill = remplissage_entete
            cellule.border = bordure

        # (libellé, valeur, est_un_montant) - un montant reçoit le format
        # numérique ci-dessus, un simple compte (nombre de ventes...) reste
        # un entier brut.
        lignes = [
            ("Chiffre d'affaires", resultat['chiffre_affaires'], True),
            ("Total des achats", resultat['total_achats'], True),
            ("Total des dépenses", resultat['total_depenses'], True),
            ("Bénéfice brut", resultat['benefice_brut'], True),
            ("Bénéfice net", resultat['benefice_net'], True),
            ("Nombre de ventes", resultat['nombre_ventes'], False),
            ("Nombre d'achats", resultat['nombre_achats'], False),
            ("Nombre de dépenses", resultat['nombre_depenses'], False),
        ]

        for decalage, (libelle, valeur, est_montant) in enumerate(lignes, start=1):
            ligne = ligne_entete + decalage
            cellule_libelle = feuille.cell(row=ligne, column=1, value=libelle)
            cellule_valeur = feuille.cell(row=ligne, column=2, value=valeur)
            cellule_libelle.border = bordure
            cellule_valeur.border = bordure
            cellule_valeur.alignment = Alignment(horizontal='right')
            if est_montant:
                cellule_valeur.number_format = format_montant

            if decalage % 2 == 0:
                cellule_libelle.fill = remplissage_alterne
                cellule_valeur.fill = remplissage_alterne

            if libelle == "Bénéfice net":
                couleur = XLSX_VERT_POSITIF if resultat['benefice_net'] >= 0 else XLSX_ROUGE_NEGATIF
                police_mise_en_evidence = Font(bold=True, color=couleur)
                cellule_libelle.font = police_mise_en_evidence
                cellule_valeur.font = police_mise_en_evidence

        # Largeur de colonnes basée sur le tableau Indicateur/Valeur
        # uniquement (pas le titre fusionné en ligne 1/2, bien plus long
        # que ce que ses deux colonnes ont individuellement besoin
        # d'accueillir). Estimée sur la représentation affichée réelle
        # (montant formaté + devise), pas la longueur brute de la valeur
        # numérique.
        largeur_libelles = max(len(libelle) for libelle, _, _ in lignes)
        largeur_valeurs = max(
            len(f"{valeur:,.2f} {devise}") if est_montant else len(str(valeur))
            for _, valeur, est_montant in lignes
        )
        feuille.column_dimensions['A'].width = largeur_libelles + 4
        feuille.column_dimensions['B'].width = largeur_valeurs + 4


def _bornes_dates_obligatoires(request):
    """Retourne (date_debut, date_fin) ou None si l'une des deux manque.
    Contrairement à calculer_resume_financier (dates optionnelles),
    lister_ventes_detaillees exige toujours des bornes explicites - voir sa
    docstring."""
    date_debut = request.GET.get('date_debut')
    date_fin = request.GET.get('date_fin')
    if not date_debut or not date_fin:
        return None
    return date_debut, date_fin


def _reponse_dates_obligatoires_manquantes():
    return Response(
        {"detail": "date_debut et date_fin sont obligatoires."}, status=status.HTTP_400_BAD_REQUEST
    )


# Colonnes du rapport détaillé des ventes, dans l'ordre d'affichage -
# partagées par la vue JSON (comme clés de tri implicite) et les deux
# exports (comme en-têtes de colonnes).
COLONNES_VENTES_DETAILLEES = [
    ("date_vente", "Date"),
    ("numero_vente", "N° vente"),
    ("vendeur", "Vendeur"),
    ("client", "Client"),
    ("produit", "Produit"),
    ("quantite", "Qté"),
    ("unite", "Unité"),
    ("prix_applique", "Prix"),
    ("sous_total", "Sous-total"),
]


class VentesDetailleesView(BoutiqueScopedMixin, APIView):
    # Même règle que ResumeFinancierView : lecture ouverte à l'employé, pas
    # réservée au propriétaire (seuls les exports le sont, ci-dessous).
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        bornes = _bornes_dates_obligatoires(request)
        if bornes is None:
            return _reponse_dates_obligatoires_manquantes()

        return Response(lister_ventes_detaillees(boutique, *bornes))


class VentesDetailleesExportPDFView(BoutiqueScopedMixin, APIView):
    # Réservé au propriétaire, même principe que ResumeFinancierExportPDFView.
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        bornes = _bornes_dates_obligatoires(request)
        if bornes is None:
            return _reponse_dates_obligatoires_manquantes()
        date_debut, date_fin = bornes

        resultat = lister_ventes_detaillees(boutique, date_debut, date_fin)
        parametres = parametres_boutique(boutique)
        devise = parametres.devise

        response = HttpResponse(content_type='application/pdf')
        nom_fichier = f"ventes-detaillees-{boutique.slug}-{date_debut}-au-{date_fin}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{nom_fichier}"'

        # Paysage plutôt que portrait : 9 colonnes tiennent mal en largeur
        # A4 portrait (utilisée pour le résumé, seulement 2 colonnes).
        marge = 1.5 * cm
        doc = SimpleDocTemplate(
            response, pagesize=landscape(A4), pageCompression=0,
            leftMargin=marge, rightMargin=marge, topMargin=marge, bottomMargin=marge,
        )
        largeur_disponible = landscape(A4)[0] - 2 * marge
        texte_periode = texte_periode_rapport(date_debut, date_fin)

        elements = [
            entete_pdf(boutique, parametres, "Ventes détaillées", texte_periode, largeur_disponible),
            Spacer(1, 0.6 * cm),
            self._tableau_ventes(resultat, devise, largeur_disponible),
        ]
        doc.build(elements, onFirstPage=pied_de_page_pdf, onLaterPages=pied_de_page_pdf)
        return response

    def _tableau_ventes(self, resultat, devise, largeur_disponible):
        entetes = [libelle for _, libelle in COLONNES_VENTES_DETAILLEES]
        data_tableau = [entetes]
        for ligne in resultat['lignes']:
            data_tableau.append([
                timezone.localtime(ligne['date_vente']).strftime('%d/%m/%Y %H:%M'),
                ligne['numero_vente'],
                ligne['vendeur'] or '—',
                ligne['client'] or '—',
                ligne['produit'],
                str(ligne['quantite']),
                ligne['unite'],
                f"{ligne['prix_applique']:.2f}",
                f"{ligne['sous_total']:.2f} {devise}",
            ])

        # Poids relatifs des colonnes (somme = 1) : Produit et Client ont le
        # plus besoin d'espace (texte libre), Qté le moins (1-2 chiffres).
        poids = [0.11, 0.10, 0.11, 0.14, 0.19, 0.06, 0.09, 0.09, 0.11]
        largeurs_colonnes = [largeur_disponible * p for p in poids]

        tableau = Table(
            data_tableau, colWidths=largeurs_colonnes,
            # Répète la ligne d'en-tête sur chaque page - potentiellement
            # beaucoup de lignes, le tableau se scinde automatiquement.
            repeatRows=1,
        )
        style_tableau = [
            ('BACKGROUND', (0, 0), (-1, 0), PDF_BLEU_PRINCIPAL),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (5, 0), (5, -1), 'RIGHT'),
            ('ALIGN', (7, 0), (8, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, PDF_GRIS_BORDURE),
            *[
                ('BACKGROUND', (0, i), (-1, i), PDF_GRIS_LIGNE_ALTERNEE)
                for i in range(1, len(data_tableau)) if i % 2 == 0
            ],
        ]
        tableau.setStyle(TableStyle(style_tableau))
        return tableau


class VentesDetailleesExportExcelView(BoutiqueScopedMixin, APIView):
    # Réservé au propriétaire, même principe que ResumeFinancierExportExcelView.
    permission_classes = [IsAuthenticated, IsOwner]

    LIGNE_ENTETE_TABLEAU = 4

    def get(self, request, *args, **kwargs):
        boutique = self._boutique_effective()
        bornes = _bornes_dates_obligatoires(request)
        if bornes is None:
            return _reponse_dates_obligatoires_manquantes()
        date_debut, date_fin = bornes

        resultat = lister_ventes_detaillees(boutique, date_debut, date_fin)
        devise = parametres_boutique(boutique).devise

        classeur = Workbook()
        feuille = classeur.active
        feuille.title = "Ventes détaillées"

        texte_periode = texte_periode_rapport(date_debut, date_fin)
        entete_excel(feuille, boutique, "Ventes détaillées", texte_periode)
        self._tableau_ventes_excel(feuille, resultat, devise)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        nom_fichier = f"ventes-detaillees-{boutique.slug}-{date_debut}-au-{date_fin}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{nom_fichier}"'
        classeur.save(response)
        return response

    def _tableau_ventes_excel(self, feuille, resultat, devise):
        ligne_entete = self.LIGNE_ENTETE_TABLEAU
        bordure = Border(*(Side(style='thin', color=XLSX_GRIS_BORDURE) for _ in range(4)))
        remplissage_entete = PatternFill('solid', fgColor=XLSX_BLEU_PRINCIPAL)
        remplissage_alterne = PatternFill('solid', fgColor=XLSX_GRIS_LIGNE_ALTERNEE)
        format_montant = f'#,##0.00 "{devise}"'
        colonnes_montant = {'prix_applique', 'sous_total'}

        for colonne, (_, libelle) in enumerate(COLONNES_VENTES_DETAILLEES, start=1):
            cellule = feuille.cell(row=ligne_entete, column=colonne, value=libelle)
            cellule.font = Font(bold=True, color='FFFFFF')
            cellule.fill = remplissage_entete
            cellule.border = bordure

        for decalage, ligne_vente in enumerate(resultat['lignes'], start=1):
            ligne = ligne_entete + decalage
            for colonne, (cle, _) in enumerate(COLONNES_VENTES_DETAILLEES, start=1):
                valeur = ligne_vente[cle]
                if cle == 'date_vente':
                    valeur = timezone.localtime(valeur).replace(tzinfo=None)
                cellule = feuille.cell(row=ligne, column=colonne, value=valeur)
                cellule.border = bordure
                if cle in colonnes_montant:
                    cellule.number_format = format_montant
                    cellule.alignment = Alignment(horizontal='right')
                if cle == 'date_vente':
                    cellule.number_format = 'DD/MM/YYYY HH:MM'
                if decalage % 2 == 0:
                    cellule.fill = remplissage_alterne

        largeurs_min = {
            'date_vente': 16, 'numero_vente': 14, 'vendeur': 14, 'client': 18,
            'produit': 24, 'quantite': 6, 'unite': 12, 'prix_applique': 12, 'sous_total': 14,
        }
        for colonne, (cle, libelle) in enumerate(COLONNES_VENTES_DETAILLEES, start=1):
            lettre = get_column_letter(colonne)
            feuille.column_dimensions[lettre].width = max(largeurs_min[cle], len(libelle) + 2)
