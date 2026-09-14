from rest_framework import serializers
from django.db import transaction
from .models import Vente, LigneVente, Client, Remboursement, StatutPaiement
from inventory.models import MouvementStock
from products.models import Produit, UniteVente, ProduitPrix
from rest_framework.exceptions import ValidationError
from tenants.profil import boutique_de
from tenants.premium import verifier_acces_premium

NOM_UNITE_PAR_TYPE = {'UNITE': 'Unité', 'DOUZAINE': 'Douzaine'}

class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ['id', 'nom', 'telephone', 'adresse', 'plafond_credit', 'date_creation']
        read_only_fields = ['date_creation']

    def validate_telephone(self, value):
        if not value.strip():
            raise serializers.ValidationError("Le téléphone est obligatoire.")
        return value

class RemboursementSerializer(serializers.ModelSerializer):
    # enregistre_par n'est jamais accepté depuis la requête : il est résolu
    # côté vue à partir de request.user et passé directement au service
    # (cf. RemboursementViewSet.perform_create), jamais depuis le payload.
    enregistre_par = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Remboursement
        fields = ['id', 'vente', 'montant', 'date_remboursement', 'enregistre_par']
        read_only_fields = ['date_remboursement']

    def validate(self, attrs):
        montant = attrs.get('montant')
        vente = attrs.get('vente')
        if montant is not None and montant <= 0:
            raise serializers.ValidationError({"montant": "Le montant doit être strictement positif."})
        if vente is not None and montant is not None and montant > vente.montant_du:
            raise serializers.ValidationError(
                {"montant": "Le montant dépasse le montant dû sur cette vente."}
            )
        return attrs

class ClientAvecDetteSerializer(serializers.ModelSerializer):
    # Annoté par ClientViewSet.avec_dette() (Sum agrégé en base, pas un
    # champ du modèle) : doit être déclaré explicitement, un ModelSerializer
    # ne peut pas déduire le type d'une annotation.
    dette_totale = serializers.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        model = Client
        fields = ['id', 'nom', 'telephone', 'adresse', 'plafond_credit', 'date_creation', 'dette_totale']

class RemboursementHistoriqueSerializer(serializers.ModelSerializer):
    enregistre_par_nom = serializers.ReadOnlyField(source='enregistre_par.username')

    class Meta:
        model = Remboursement
        fields = ['id', 'montant', 'date_remboursement', 'enregistre_par_nom']

class HistoriqueClientSerializer(serializers.ModelSerializer):
    # Serializer dédié à ClientViewSet.historique() : n'expose que ce dont
    # cet écran a besoin (jamais VenteSerializer tel quel, qui inclut les
    # lignes/produits/stock - hors sujet ici).
    remboursements = RemboursementHistoriqueSerializer(many=True, read_only=True)

    class Meta:
        model = Vente
        fields = [
            'id', 'numero', 'date_vente', 'statut', 'montant_net', 'montant_paye',
            'montant_du', 'statut_paiement', 'remboursements',
        ]

class LigneVenteSerializer(serializers.ModelSerializer):
    produit_nom = serializers.ReadOnlyField(source='produit.nom')
    unite_nom = serializers.ReadOnlyField(source='unite.nom')
    # Optionnel : si absent, l'unité est dérivée de type_vente (chemin
    # historique, compatible avec le frontend actuel). Si présent, elle
    # prime et permet de vendre en unité personnalisée (Kg, Sac 25kg...).
    unite = serializers.PrimaryKeyRelatedField(queryset=UniteVente.objects.all(), required=False)

    class Meta:
        model = LigneVente
        fields = ['id', 'produit', 'produit_nom', 'quantite', 'type_vente', 'unite', 'unite_nom', 'prix_applique', 'prix_achat_unitaire', 'sous_total']
        read_only_fields = ['prix_achat_unitaire', 'sous_total']

    def validate_quantite(self, value):
        # Une quantité négative inverserait le sens de l'opération : au
        # lieu de retirer du stock, la vente en ajouterait (faille
        # identifiée - audit complémentaire point 2). Zéro n'a pas de sens
        # non plus pour une ligne de vente.
        if value <= 0:
            raise serializers.ValidationError("La quantité doit être strictement positive.")
        return value

class VenteSerializer(serializers.ModelSerializer):
    lignes = LigneVenteSerializer(many=True)
    utilisateur_nom = serializers.ReadOnlyField(source='utilisateur.username')
    # PWA Niveau 2 : optionnels en écriture, absents => chemin historique
    # inchangé (vente en direct). synchronisation_differee ne persiste pas
    # tel quel sur le modèle (le champ équivalent en base est
    # creee_hors_ligne, positionné explicitement dans create() ci-dessous) :
    # write_only pour ne jamais apparaître en lecture, où il n'aurait pas
    # de sens (creee_hors_ligne est la valeur qui fait foi une fois la
    # vente enregistrée).
    cle_idempotence = serializers.UUIDField(required=False, allow_null=True)
    horodatage_client = serializers.DateTimeField(required=False, allow_null=True)
    synchronisation_differee = serializers.BooleanField(required=False, default=False, write_only=True)
    # Vente à crédit (V2) : absent => comportement historique inchangé
    # (vente comptant, statut_paiement/montant_du restent à leurs défauts
    # modèle PAYE/0). Fourni => statut_paiement/montant_du sont recalculés
    # dans create() ci-dessous, jamais soumis directement par le client.
    client_credit = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Vente
        fields = [
            'id', 'numero', 'date_vente', 'client', 'client_credit', 'montant_total',
            'remise', 'montant_net', 'montant_paye', 'monnaie_rendue',
            'mode_paiement', 'utilisateur', 'utilisateur_nom', 'statut', 'lignes',
            'cle_idempotence', 'horodatage_client', 'creee_hors_ligne',
            'stock_ajuste_manuellement', 'synchronisation_differee',
            'statut_paiement', 'montant_du',
        ]
        read_only_fields = [
            'numero', 'date_vente', 'montant_total', 'montant_net', 'monnaie_rendue',
            'statut', 'creee_hors_ligne', 'stock_ajuste_manuellement',
            'statut_paiement', 'montant_du',
        ]

    @transaction.atomic
    def create(self, validated_data):
        boutique = boutique_de(self.context['request'])
        if not boutique.actif:
            raise serializers.ValidationError("Cette boutique a été désactivée.")

        # Idempotence (PWA Niveau 2) : une même clé déjà enregistrée pour
        # cette boutique renvoie la vente existante telle quelle - aucune
        # nouvelle écriture, aucun stock touché, aucun MouvementStock créé.
        # Doit être vérifié avant toute autre logique (verrouillage produit
        # compris) pour qu'un rejeu réseau (vente déjà synchronisée avec
        # succès mais accusé de réception perdu) reste un pur no-op.
        cle_idempotence = validated_data.get('cle_idempotence')
        if cle_idempotence is not None:
            vente_existante = Vente.objects.filter(
                boutique=boutique, cle_idempotence=cle_idempotence
            ).first()
            if vente_existante is not None:
                return vente_existante

        synchronisation_differee = validated_data.pop('synchronisation_differee', False)
        lignes_data = validated_data.pop('lignes')

        # Assigner l'utilisateur connecté si présent dans le contexte de la requête
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['utilisateur'] = request.user

        if synchronisation_differee:
            validated_data['creee_hors_ligne'] = True

        # Vente à crédit (V2) : ne jamais supposer qu'un client_credit
        # soumis appartient à la boutique de l'appelant (même principe que
        # produit/unite ci-dessous, faille déjà trouvée et corrigée sur ces
        # deux champs en Phase 4A/étape 1).
        client_credit = validated_data.get('client_credit')
        if client_credit is not None:
            if client_credit.boutique_id != boutique.id:
                raise ValidationError("Ce client n'appartient pas à votre boutique.")
            # Vente à crédit réservée au palier Premium - une vente comptant
            # normale (sans client_credit) reste toujours autorisée, quel
            # que soit le palier.
            verifier_acces_premium(boutique)

        vente = Vente.objects.create(boutique=boutique, **validated_data)

        montant_total = 0
        # Une même vente peut contenir plusieurs lignes pour le même
        # produit (ex: 2 Kg + 1 Sac 25kg du même article) : on réutilise la
        # même instance pour un produit donné afin que les déductions
        # s'accumulent correctement en mémoire avant chaque save() (sinon
        # seule la dernière ligne du panier "survivrait" en base).
        #
        # Ces instances sont verrouillées via select_for_update(), triées
        # par pk croissant, AVANT toute lecture de quantite_en_stock -
        # sinon deux ventes/achats concurrents sur le même produit
        # liraient tous les deux le stock d'avant-transaction et
        # pourraient survendre (race condition, P1 point 7). L'ordre
        # croissant est la même convention appliquée à tous les points de
        # mutation du stock (Vente/Achat create+annuler, MouvementStock),
        # pour ne jamais provoquer de deadlock entre verrous croisés.
        produit_ids = sorted({ligne_data['produit'].pk for ligne_data in lignes_data})
        produits_par_id = {
            produit.pk: produit
            for produit in Produit.objects.select_for_update().filter(pk__in=produit_ids).order_by('pk')
        }

        # PWA Niveau 2 : une vente synchronisée en différé peut arriver
        # après que le stock a déjà bougé sur l'appareil qui a créé la
        # vente en premier - le stock disponible au moment de la synchro
        # peut donc être inférieur à ce qu'il était au moment réel de la
        # vente. Dans ce cas précis (et uniquement celui-là), on laisse le
        # décrément se faire quand même plutôt que de perdre une vente déjà
        # conclue en boutique, et on le signale via stock_ajuste_manuellement.
        stock_negatif_detecte = False

        for ligne_data in lignes_data:
            produit = produits_par_id[ligne_data['produit'].pk]
            quantite = ligne_data['quantite']
            unite_soumise = ligne_data.pop('unite', None)

            # Vérification explicite d'appartenance - ne jamais supposer
            # qu'un produit ou une unité soumis appartiennent à la
            # boutique de l'appelant (même faille trouvée et corrigée en
            # Phase 4A pour ProduitPrixViewSet, appliquée ici aussi).
            if produit.boutique_id != boutique.id:
                raise ValidationError(f"Le produit '{produit.nom}' n'appartient pas à votre boutique.")

            if unite_soumise is not None:
                if unite_soumise.boutique_id != boutique.id:
                    raise ValidationError("L'unité sélectionnée n'appartient pas à votre boutique.")
                unite = unite_soumise
                type_vente = {'Unité': 'UNITE', 'Douzaine': 'DOUZAINE'}.get(unite.nom, 'PERSONNALISE')
            else:
                # Chemin historique inchangé : dérive l'unité depuis
                # type_vente, pour rester compatible avec le frontend actuel.
                type_vente = ligne_data['type_vente']
                if type_vente not in NOM_UNITE_PAR_TYPE:
                    raise ValidationError(
                        f"Merci de préciser une unité pour ce type de vente ('{type_vente}')."
                    )
                nom_unite = NOM_UNITE_PAR_TYPE[type_vente]
                try:
                    unite = UniteVente.objects.get(boutique=boutique, nom=nom_unite)
                except UniteVente.DoesNotExist:
                    raise ValidationError(
                        f"Aucune unité '{nom_unite}' n'est configurée pour votre boutique. "
                        f"Contactez le support."
                    )

            ligne_data['type_vente'] = type_vente

            try:
                produit_prix = ProduitPrix.objects.get(produit=produit, unite=unite)
            except ProduitPrix.DoesNotExist:
                raise ValidationError(
                    f"Aucun prix configuré pour '{produit.nom}' en '{unite.nom}'."
                )

            # Calculer le nombre d'unités réelles à déduire du stock, via le
            # facteur de conversion centralisé sur l'unité de vente.
            unites_reelles = quantite * unite.facteur_conversion
            if unites_reelles != unites_reelles.to_integral_value():
                raise ValidationError(
                    f"'{produit.nom}' ne peut pas être vendu en quantité fractionnaire "
                    f"avec l'unité '{unite.nom}' pour le moment. Utilisez une quantité entière."
                )
            unites_a_deduire = int(unites_reelles)

            # Règle métier : Vérification stricte du stock disponible -
            # comportement inchangé pour toute vente normale. Contournée
            # uniquement pour une synchronisation différée explicite (PWA
            # Niveau 2) : la vente a déjà eu lieu physiquement en boutique,
            # la refuser ici ferait perdre une vente réelle pour une raison
            # purement comptable côté serveur.
            if produit.quantite_en_stock < unites_a_deduire:
                if not synchronisation_differee:
                    raise ValidationError(
                        f"Stock insuffisant pour le produit '{produit.nom}'. "
                        f"Demandé : {unites_a_deduire} unités, Disponible : {produit.quantite_en_stock} unités."
                    )
                stock_negatif_detecte = True

            # Le prix et le facteur de conversion sont figés sur la ligne au
            # moment de la vente (comme prix_applique) : les rapports
            # historiques ne doivent jamais être recalculés en direct depuis
            # UniteVente, qui peut être modifiée après coup.
            ligne_data['unite'] = unite
            ligne_data['facteur_conversion_applique'] = unite.facteur_conversion
            ligne_data['prix_applique'] = produit_prix.prix
            # Coût de revient figé au moment de la vente (bug P1 corrigé) :
            # Produit.prix_achat est relu ici, sous le verrou select_for_update
            # posé plus haut, et gravé sur la ligne pour ne plus jamais
            # dépendre de sa valeur courante lors des calculs de bénéfice.
            ligne_data['prix_achat_unitaire'] = produit.prix_achat

            # Créer la ligne de vente
            ligne = LigneVente.objects.create(vente=vente, boutique=boutique, **ligne_data)
            montant_total += ligne.sous_total

            # Mettre à jour le stock du produit
            produit.quantite_en_stock -= unites_a_deduire
            produit.save()

            # Enregistrer le mouvement de stock (SORTIE)
            MouvementStock.objects.create(
                boutique=boutique,
                produit=produit,
                type_mouvement='SORTIE',
                quantite=unites_a_deduire,
                motif=f"Vente #{vente.numero}"
            )

        # Calculs financiers finaux
        remise = vente.remise or 0
        # La remise ne peut pas dépasser le montant total réellement calculé
        # à partir des lignes (montant_total soumis par le client est de
        # toute façon en lecture seule) : sans ce garde-fou, une remise
        # supérieure au total rendait montant_net négatif, ce qui combiné à
        # un montant_paye négatif (avant la validation ajoutée sur ce champ)
        # laissait ressortir une "monnaie rendue" positive - contournement
        # démontré, audit point 3.
        if remise > montant_total:
            raise ValidationError("La remise ne peut pas dépasser le montant total de la vente.")
        montant_net = montant_total - remise

        # Vente à crédit (V2) : un acompte à la vente est courant (comptoir,
        # "il donne 2000 sur 5000, le reste plus tard") - montant_paye reste
        # tel que soumis, borné à [0, montant_net] (un acompte ne peut pas
        # dépasser le montant de la vente). Le garde-fou normal ci-dessous
        # (montant_paye >= montant_net, audit point 3) ne s'applique qu'à la
        # vente comptant classique : à crédit, payer moins que le net est
        # précisément le principe, et monnaie_rendue reste à 0 (jamais de
        # dépassement possible ici, donc jamais de monnaie à rendre).
        est_vente_a_credit = vente.client_credit_id is not None
        if est_vente_a_credit:
            if vente.montant_paye < 0 or vente.montant_paye > montant_net:
                raise ValidationError(
                    "L'acompte d'une vente à crédit doit être compris entre 0 et le montant net de la vente."
                )
            monnaie_rendue = 0
        else:
            if vente.montant_paye < montant_net:
                raise ValidationError("Le montant payé est inférieur au montant net de la vente.")
            monnaie_rendue = vente.montant_paye - montant_net

        vente.montant_total = montant_total
        vente.montant_net = montant_net
        vente.monnaie_rendue = monnaie_rendue
        if est_vente_a_credit:
            montant_du = montant_net - vente.montant_paye
            vente.montant_du = montant_du
            if montant_du <= 0:
                # Le vendeur avait prévu du crédit mais le client a
                # finalement tout payé sur place : pas une erreur, une
                # vente normale au final.
                vente.montant_du = 0
                vente.statut_paiement = StatutPaiement.PAYE
            elif vente.montant_paye > 0:
                vente.statut_paiement = StatutPaiement.PARTIEL
            else:
                vente.statut_paiement = StatutPaiement.EN_ATTENTE
        if stock_negatif_detecte:
            vente.stock_ajuste_manuellement = True
        vente.save()

        return vente