# Travail en cours

Mis à jour le 2026-10-23.

## Incident prod (2026-10-10 au 2026-10-13) : base Render expirée

- La base Render `iwishop-db` (plan gratuit) a expiré le 2026-10-10. Render l'a suspendue et avait prévu de la supprimer vers le 2026-10-16. Symptôme : le backend ne trouvait plus la base (`OperationalError` « could not translate host name »).
- Mahamadou l'a passée au plan payant (`0.1c-256mb`, 6 $/mois) le 2026-10-13. La prod remarche (constat de Mahamadou).
- Intégrité des données : établie par Mahamadou le 2026-10-13 : les ventes V-2F621063 et V-AD91351B (Bintou) sont présentes, la caisse du 2026-10-05 affiche ses chiffres, `iwishop-db` est « Available ».
- Aucun commit n'a été poussé pendant la panne : à la rédaction de cette note, `main` = `origin/main`, sur `b9053a7`. Règle tant qu'une panne dure : tout commit poussé est noté « non vérifié en prod », et on les vérifie tous après la réparation.
- Horloge du PC décalée une fois de plus le 2026-10-16 : elle affichait le 2026-10-15 (et a reculé de plusieurs heures après une première correction). Mise à l'heure à la main par Mahamadou, synchronisation automatique désactivée pour la journée ; vérifiée avec `Get-Date` (vendredi 2026-10-16) avant les commits `b047434` et `bba2b20`. À réactiver et revérifier ensuite.
- Horloge du PC décalée le 2026-10-22 : elle affichait le vendredi 2026-10-23 (Claude s'y est fié dans un message). Corrigée par Mahamadou, vérifiée avec `Get-Date` (jeudi 2026-10-22, 13 h 22) avant `d3bd0e1`, puis avant chaque commit suivant.
- Horloge du PC de nouveau décalée : le 2026-10-13, elle affichait le 2026-10-07. Remise à l'heure par Mahamadou le même jour, vérifiée avec `date` et `Get-Date` (2026-10-13) avant le commit de cette note (`ccfcb3c`, daté du 2026-10-13). Les dates de cette note viennent de Mahamadou et de Render, pas du PC.

## Prochaines étapes (ordre décidé par Mahamadou le 2026-10-21)

Aucun vrai client à ce jour (Mahamadou, 2026-10-21) : SoraShop n'est pas utilisée. Les notes plus anciennes parlent d'un « seul vrai client » (boutique SoraShop) : c'est dépassé. Objectif : finir la liste « prêt à vendre », puis chercher des clients.

Liste « prêt à vendre », dans l'ordre :
1. Landing page : à refaire dans le dépôt, comme un projet séparé de l'app. Une première version avait été faite avec ChatGPT Sites, mais l'abonnement ChatGPT de Mahamadou a expiré et son code ne peut pas être récupéré. Les 15 captures de cette version servent de modèle. Plan validé le 2026-10-22 (voir « Landing page : plan validé le 2026-10-22 »). Code fait et poussé le 2026-10-22, CI verte (voir « Landing page : fait le 2026-10-22 ») ; reste la mesure de fluidité, interrompue.
2. Essai gratuit : vérifier que l'app tient la promesse de la landing page (14 jours, gratuit, sans carte bancaire), et l'aligner si besoin. Fait le 2026-10-22 (voir « Landing page : plan validé le 2026-10-22 », essai gratuit). Reste le chantier séparé de la recherche par le nom (voir « En attente, côté code »).
3. Mise en ligne de la landing page sur `iwishop.app`. Fait par Mahamadou le 2026-10-22, vérifié en prod le même jour (voir « Landing page : mise en ligne (2026-10-22) »).
4. 2FA sur GitHub et sur Render. GitHub : fait le 2026-10-22 (voir « Sécurité GitHub (2026-10-22) »). Render : à faire.
5. Sauvegarde automatique : le commit 4 (voir « Chantier : sauvegarde de la base »). Son préalable, le 2FA Cloudflare, est fait depuis le 2026-10-19.
6. Sécurité : « pas d'abonnement = accès » (voir « En attente, côté code »), `/admin-plateforme`, limite de débit.
7. Service web Render en plan payant (aujourd'hui gratuit, avec mise en veille).

Marque (Mahamadou, 2026-10-21) : le nom s'écrit « iwiShop » partout (app, landing page, emails). Le logo est celui de l'app (la goutte « iwi »), pas le sac bleu de la version ChatGPT. Constat du 2026-10-21 (recherche dans le dépôt, rien n'est corrigé) : les emails (`tenants/emails.py`), PayDunya (`tenants/paydunya.py`), l'écran de connexion et l'assistant écrivent déjà « iwiShop ». En revanche, l'app affiche « IwiShop » dans `index.html` (titre, `apple-mobile-web-app-title`, description), `manifest.webmanifest` (`name`, `short_name`), `App.jsx` (texte alternatif du logo), `InstallPwaModal.jsx` (3 textes, et ses tests) et `main.jsx` (message de nouvelle version). Le nom d'expéditeur des emails vient de `BREVO_SENDER_NAME` sur Render (« iwiShop » si absente) : valeur non relevée.

Fait le 2026-10-22, poussé le même jour (`d574c75..bfd9138`), CI verte (run 39792929659 sur `bfd9138` : jobs backend et frontend en succès, de 14 h 07 à 14 h 08 UTC ; Vercel a déployé l'app dans la minute) :
- `d3bd0e1` `fix(frontend)` : « iwiShop » dans `index.html`, `manifest.webmanifest`, `App.jsx`, `InstallPwaModal.jsx` et ses tests, `main.jsx`. Lint OK, build OK ; tests 380/380 au 2e passage (le 1er, en 950 s, avait 7 échecs dans 4 fichiers et 3 erreurs, non identifiés : seules les 15 dernières lignes avaient été gardées ; 34 fichiers comptés sur 37, ce qui évoque des workers non démarrés ; 2,4 Go de RAM libre sur 8 à la relance).
- `1c41185` `chore(frontend)` : `favicon.ico` 32 px tiré de la goutte ; retrait de `favicon.svg` (éclair de Vite) et `icons.svg` (icônes du modèle Vite), référencés nulle part mais mis en cache par le service worker. L'onglet affichait déjà la goutte (`index.html` déclare `/pwa-192x192.png`) ; `/favicon.ico` renvoyait la page en `text/html`. Vérifié sur `vite preview` : `/favicon.ico` en `image/x-icon`, `dist/sw.js` sans `.svg` (10 entrées), onglet vu par Mahamadou. Vérifié en prod le 2026-10-22 à 14 h 08 UTC (curl) : `/favicon.ico` en 200, `image/vnd.microsoft.icon` (type officiel du format ICO ; `image/x-icon` en est l'ancien nom, accepté de même), 1 477 octets, même empreinte SHA-256 que le fichier du dépôt ; `/favicon.svg` en 200 `text/html` (la page de l'app, le fichier n'existe plus) ; `sw.js` servi sans aucun `.svg` ; titre de la page « iwiShop ».
- `9c6d0e9` `docs` : `CLAUDE.md`, « iWiShop » → « iwiShop ».
- `ad961a8` `fix(hooks)` et `bfd9138` `ci` : voir « Hook de secrets : échec fermé (2026-10-22) ».
Reste : Mahamadou relève `BREVO_SENDER_NAME` sur Render. Les commentaires internes « audit IwiShop » (`accounts/`, `tenants/`) restent tels quels.

## Lot du 2026-10-23 (méthode « par lot »)

Six tâches données par Mahamadou, un commit chacune, poussées le 2026-10-23 sur « oui, push » (`09c375f..583ca1a`). CI verte sur `583ca1a` (jobs backend, frontend et landing en succès, de 14 h 41 à 14 h 42 UTC). Non vérifié en prod.
- `37bc924` `fix(parametres)` : `limite_questions_assistant_par_jour` en lecture seule (un PATCH à 10000 laisse 30 en base). Relevé : aucun autre champ réservé à la plateforme n'est modifiable par le propriétaire.
- `c4fd1dc` `fix(frontend)` : panier de l'écran de vente. Sous `sm`, Type, Qté et Prix U. passent sous le nom du produit. Mesure Playwright : tableau de 473 px pour 286 / 316 visibles avant, 286/286 et 316/316 après ; 1366 px inchangé.
- `b7465e1` `fix(frontend)` : `Login.jsx`, carte `w-full max-w-sm` dans `px-4` (16→344 à 360 px, au lieu de 0→360).
- `22d06e8` `fix(tenants)` : emails d'identifiants et d'alerte d'expiration en vouvoiement (texte seulement).
- `f99d83a` `feat(tenants)` : route publique `GET tenants/essai-gratuit/` (`{"duree_jours": n}`, 404 sans la formule) ; `DemandeAccesPage` l'affiche, et dit « Essai gratuit, sans carte bancaire. » sans réponse exploitable. La formule reste trouvée par son nom (`NOM_FORMULE_ESSAI`) : ne jamais la renommer.
- `583ca1a` `feat(tenants)` : `creer-paiement` limité à 10 par heure et par utilisateur (choix validé par Mahamadou), 429 avant toute écriture et tout appel à PayDunya.
Tests au moment du push : backend 698 OK, hook 8 OK, frontend 387/387 (38 fichiers), lint et build OK.
Relevés pendant ce lot (`MonAbonnement.jsx` qui tutoie, carte `w-96` d'`AdminPlateformePage.jsx`, contradiction avec `CLAUDE.md`) : traités par le lot 2 du même jour.
Horloge du PC : saut d'environ 12 h le 2026-10-23 au matin (00 h 27 puis 12 h 37) ; l'heure des commits concorde ensuite avec celle de GitHub (CI à 14 h 41 UTC, dernier commit à 14 h 27).

## Images de catégories et logo (lot du 2026-10-23, méthode par lot)

Plan validé par Mahamadou le 2026-10-23 : carré recadré au centre, 320 px, WebP qualité 80 ; tout employé peut envoyer ou retirer l'image ; affichage dans l'écran Catégories seulement (le filtre par catégorie sur l'écran de vente est un chantier séparé, prévu le 2026-10-24) ; hors ligne, icône par défaut sans cache ; tout en un seul push ; logo passé par le même traitement (étape 6), anciens logos gardés pour les factures.

Commits locaux, pas encore poussés (le push attend « oui, push ») :
1. `69c64b9` `feat(products)` : `traiter_photo(fichier, cote_max=800, carre=False)`.
2. `b1a74de` `refactor(products)` : `enregistrer_image`, `retirer_image` et `supprimer_image_apres_commit` communs à tout champ image (option `supprimer_ancienne=False` pour le logo). Tests des produits inchangés (80/80), dont celui de concurrence sur deux connexions PostgreSQL.
3. `4a450c6` `feat(categories)` : `Categorie.image`, migration `categories/0005` (`ADD COLUMN NULL`) ; `POST`/`DELETE categories/{id}/image/` ; `image` en lecture seule dans la catégorie ; image supprimée après le commit au remplacement, au retrait et à la suppression de la catégorie.
4. `38eaf98` `feat(frontend)` : image dans le formulaire de création (envoyée après la catégorie ; échec : « Catégorie créée, image non envoyée : … »).
5. `a32f125` `feat(frontend)` : miniature de 48 px sur la carte ; l'écran n'a pas de fiche de modification, donc « Ajouter / Changer l'image » et « Retirer l'image » sur la carte, envoyés tout de suite. Champ absent (backend pas encore déployé) : icône, aucune action. Mesuré à 360 et 390 px (Playwright, API simulée) : pas de débordement.
6. `568aabf` `fix(parametres)` : le logo passe par `traiter_photo` (format réel, 40 mégapixels, WebP 800 px, métadonnées supprimées), chemin `logos/<id boutique>/<uuid>.webp` (migration `parametres/0008`, no-op en SQL). Les anciens logos restent à leur chemin. `Settings.jsx` ne propose plus que JPG, PNG et WebP.
7. commit `docs` : cette note.

Preuves : chaque correctif vu échouer avant (validation : GIF nommé .png, texte nommé .jpg, 5 Mo, 40 mégapixels, position GPS ; suppression : remplacement, retrait, suppression de la catégorie, échec de la base ; accès : abonnement expiré ; migration : INSERT de l'ancien code en SQL brut). Une contre-épreuve survit : retirer `if (isSaving) return;` du formulaire de création, déjà doublé par le bouton désactivé.
Tests au moment du commit docs : backend 727 OK, hook 8 OK, frontend 403/403 (39 fichiers), lint et build OK.

À vérifier en prod après le push (rien n'est vérifié) : envoyer une image de catégorie, puis la changer et la retirer ; vérifier dans R2 que `categories/<id>/` ne garde que le dernier fichier ; envoyer un nouveau logo et vérifier qu'il est en `.webp` dans `logos/<id>/`, que l'ancien reste, et qu'une facture déjà émise garde son ancien logo.

Relevés, rien n'est corrigé :
- `ProductsMiniature.test.jsx`, « hors ligne : image par défaut… », a échoué une fois (« Pas de photo pour Savon » introuvable) dans un groupe de 5 fichiers ; seul : 4/4, avec et sans le changement de `PhotoProduit` ; deux passages du groupe ensuite : 42/42. À surveiller.
- Suite frontend complète en 1 716 s le 2026-10-23 (contre 330 s plus tôt le même jour), environnement 92 % du temps, 2,5 Go de RAM libre, aucun Chrome ouvert : cause inconnue.
- Les images (produits, catégories, logos) ne sont pas dans la sauvegarde de la base (D8 des photos de produits).

## Lot 3 du 2026-10-23 (méthode par lot, sécurité)

Poussés le 2026-10-23 (`c9ec562..e980150`), CI verte sur `e980150` (jobs backend, frontend et landing en succès, de 16 h 10 à 16 h 11 UTC). Non vérifiés en prod. Relus par Mahamadou après le push, pas avant ; contre-épreuve des tâches 1 et 2 refaite sur `e980150`, mêmes échecs sans les correctifs (401 au lieu de 429 ; 32 lignes au lieu de 12) :
- `12d4cad` `fix(settings)` : `CACHES` avec `OPTIONS: {'MAX_ENTRIES': 50000}`. Avant, au-delà de 300 entrées, le cache effaçait le premier tiers des clés par ordre alphabétique, compteurs de limite compris. Test `test_compteur_ip_survit_a_plus_de_300_entrees_en_cache` : IP bloquée, 400 entrées écrites, nouvelle tentative ; sans le correctif, 401 au lieu de 429 (compteur effacé).
- `f7ad50f` `fix(accounts)` : `CustomTokenObtainPairView.check_throttles` s'arrête au premier refus (IP d'abord). Avant, une tentative bloquée par IP écrivait quand même une entrée par nouvel identifiant, et comptait contre la limite de cet identifiant. Test `test_requete_bloquee_par_ip_n_ecrit_rien_dans_le_cache` : IP bloquée puis 20 identifiants nouveaux ; sans le correctif, 32 lignes de cache au lieu de 12.
- Contre-épreuve sur l'état final : chaque correctif retiré seul fait échouer son propre test, et seulement lui ; fichiers restaurés à l'identique (empreintes vérifiées).
- Tâche 3, vérification : `demande-acces` et `creer-paiement` n'ont qu'une limite chacune (pas de `DEFAULT_THROTTLE_CLASSES`). Un refus passe par `throttle_failure()`, qui n'écrit rien : pas le même défaut, rien à corriger.
- `5f7844d` `fix(frontend)` : `RetourPaiement.jsx` vouvoie (« Réessayez cette page dans quelques instants »). Nouveau test (horloge simulée, 12 vérifications) : premier test de l'état « délai dépassé ».
- commit `docs` : cette note.
Tests au moment du commit docs : backend 700 OK, hook 8 OK, frontend 390/390 (38 fichiers), lint et build OK.

## Lot 2 du 2026-10-23 (méthode par lot)

Poussés le 2026-10-23 (`583ca1a..c9ec562`), CI verte sur `c9ec562` (jobs backend, frontend et landing en succès, de 15 h 21 à 15 h 22 UTC). Non vérifiés en prod :
- `60d1bd6` `fix(frontend)` : `MonAbonnement.jsx` vouvoie (« Réessayez dans un instant ») ; un 429 de `creer-paiement` affiche « Trop de tentatives de paiement. Réessayez dans une heure. », boutons gardés. 3 tests vus échouer avant, 15/15 après.
- `0a6ea75` `fix(frontend)` : `AdminPlateformePage.jsx`, carte `w-full max-w-sm` dans `px-4` (16→344 à 360 px, au lieu de 0→360 ; 1366 px inchangé).
- commit `docs` : `CLAUDE.md` (méthode par lot, durée de l'essai dans la landing) et cette note.
Relevé : `RetourPaiement.jsx` tutoyait encore ; corrigé par le lot 3 (`5f7844d`).

Vérification (tâche 3, rien n'est modifié) : limites de débit et workers.
- `CACHES` : `DatabaseCache` (table `django_cache_table` dans la base Postgres), sans variante par environnement : la prod l'utilise. Les compteurs (connexion, demande d'accès, `creer-paiement`) sont donc partagés entre tous les workers, et même entre plusieurs instances.
- Nombre de workers gunicorn : pas dans le dépôt (ni `Procfile`, ni `render.yaml`, ni `gunicorn.conf.py`) ; la commande de démarrage est dans le tableau de bord Render. Sans `--workers`, gunicorn lit `WEB_CONCURRENCY`, sinon 1 worker. À relever par Mahamadou : Settings → Start Command, et Environment → `WEB_CONCURRENCY`. La prod répond `x-render-origin-server: gunicorn`.
- Risque trouvé à la lecture du code (Django 6.0.7, DRF), puis reproduit par les tests du lot 3 : le cache a la limite par défaut de 300 entrées. Au-delà, chaque écriture supprime les entrées expirées puis le premier tiers des clés par ordre alphabétique : `throttle_creer_paiement_…`, puis `throttle_demande_acces_…`, puis `throttle_login_ip_…`, avant `throttle_login_username_…`. Une tentative de connexion bloquée par la limite par IP écrit quand même une clé par nouvel identifiant (DRF évalue toutes les limites). Une seule IP peut donc dépasser 300 entrées en une minute et effacer les compteurs, y compris le sien.
- Autre limite, mineure : lecture puis écriture non atomiques ; des requêtes simultanées sur deux workers peuvent dépasser un peu le seuil.
- Pistes retenues par Mahamadou et faites par le lot 3 (`12d4cad`, `f7ad50f`). Lecture non atomique des compteurs acceptée (dépassement de 1-2 unités, Redis plus tard si besoin).
- Workers (relevé par Mahamadou le 2026-10-23) : gunicorn tourne sans `--workers` et `WEB_CONCURRENCY` n'existe pas sur Render, donc probablement 1 worker. À revoir avec les premiers clients (Metrics Render).

## Hook de secrets : échec fermé (2026-10-22)

Constat (commit `1c41185`, trace Python pendant le commit) : le hook laissait passer des fichiers sans les analyser, dans quatre cas :
- lecture en cp1252 sous Windows (`text=True`) : un octet inconnu de cet encodage (U+FE0F d'un emoji : octet 0x8F) faisait sauter le fichier. `AdminPlateformePage.jsx` et `tenants/emails.py` n'avaient jamais été analysés ;
- `git show` en échec : fichier sauté sans message ;
- nom avec accent : chemin entre guillemets (sans `-z`), donc `git show` en échec ;
- fichier renommé : exclu par `--diff-filter=ACM`.

Corrigé par `ad961a8` : lecture en octets, décodage UTF-8 (`errors="replace"`) ; seul un fichier binaire (octet nul dans les 8 000 premiers octets) est sauté, et il est cité ; un fichier illisible ou une erreur inattendue bloque le commit. Tests : `scripts/git-hooks/test_pre_commit.py`, 8 tests ; 7 échouent sur l'ancien hook (le 8e, secret ASCII simple, sert de témoin), 8/8 passent ; 5 mutations sur 5 détectées. `bfd9138` lance ces tests dans le job backend de la CI, et la même commande est dans les vérifications locales de `CLAUDE.md`. Premier passage en CI (run 39792929659) : étape en succès, ce qui prouve qu'au moins un test a tourné sans échec (Python 3.13 sort en erreur si aucun test ne tourne). Nombre de tests lu dans le journal par Mahamadou (le journal n'est pas lisible par l'API sans droits d'administrateur) : « Ran 8 tests, OK ».

Contrôles en lecture seule (2026-10-22) : passage unique du hook corrigé sur les 405 fichiers suivis : 396 analysés, 9 binaires (images de `sorashop-frontend` et `favicon.ico`), 0 illisible, 0 trouvaille. `AdminPlateformePage.jsx` (540 lignes) et `tenants/emails.py` (129 lignes) : 0 trouvaille, et 0 aussi dans leurs 10 versions passées.

Limite connue : un secret dans un fichier binaire n'est pas détecté (choix de Mahamadou ; chaque binaire sauté est cité).

## Sécurité GitHub (2026-10-22)

Fait par Mahamadou le 2026-10-22 :
- 2FA activé sur le compte GitHub (application), codes de secours sur papier ;
- dépôt : Private vulnerability reporting, Secret Protection et Push protection activés ;
- Secret scanning : aucune alerte.

## Landing page : mise en ligne (2026-10-22)

Fait par Mahamadou le 2026-10-22 :
- Vercel : nouveau projet `iwishop-landing` (même dépôt, Root Directory `landing`, preset Vite lu dans `vercel.json`). Adresse de test `iwishop-landing.vercel.app` : 4 liens vérifiés (Se connecter, Commencer, WhatsApp, Mentions légales).
- Domaines du projet landing : `iwishop.app` (Production) ; `www.iwishop.app` en 308 vers `iwishop.app` (case « rediriger vers www » décochée, pour garder `iwishop.app` comme adresse officielle).
- Cloudflare DNS (DNS only) : CNAME `@` → `1ad0e908a17c3b56.vercel-dns-017.com` (CNAME à la racine, aplati par Cloudflare) ; CNAME `www` → même valeur. Total : `api`, `gestion`, `iwishop.app`, `www`.
- Cloudflare Email Routing activé : 3 MX, DKIM et SPF ajoutés sans conflit avec le CNAME de la racine ; destination Gmail vérifiée ; `contact@iwishop.app` → Gmail, actif ; catch-all en Drop, désactivé. Test de réception : pas encore fait.

Vérifié en prod le 2026-10-22 avec curl via DoH (`--doh-url https://cloudflare-dns.com/dns-query` : la box de Mahamadou gardait un NXDOMAIN en cache pour `www`) :
- `iwishop.app` : 200, `text/html`, titre « iwiShop : gestion de boutique, ventes, stock et caisse », adresse canonique `https://iwishop.app/` ;
- `www.iwishop.app` : 308, `Location: https://iwishop.app/` ;
- `/mentions-legales` et `/confidentialite` : 200, `text/html` ;
- `/favicon.ico` (200, `image/vnd.microsoft.icon`) et `/og-image.png` (200, `image/png`, déclarée en `og:image` 1200×630) : mêmes empreintes SHA-256 que `landing/public/`.
Non vérifié : HTML servi comparé à un build de `d995b62` (rien ne prouve encore que la prod sert le dernier commit de la landing).

À faire :
- tester la réception sur `contact@iwishop.app` depuis un autre compte ;
- activer sur les deux projets Vercel « ne pas redéployer si rien n'a changé dans le dossier » ;
- refaire la mesure de fluidité (voir « Landing page : fait le 2026-10-22 ») ;
- 2FA Render (étape 4).

## Landing page : fait le 2026-10-22

Poussé en deux fois, CI verte les deux fois (jobs landing, backend et frontend en succès) :
- `ab5218f..d995b62` : les 8 commits `landing` et `ci` (`a0ce057` à `d995b62`). Run 39838311034, terminé à 19 h 15 UTC.
- `d995b62..9395de9` : `cb187e3` et `9395de9`. Run 39853176393, de 20 h 56 à 20 h 58 UTC.
Mise en ligne le même jour : voir « Landing page : mise en ligne (2026-10-22) ».

Mesure de fluidité de la landing (animations de `d995b62`) : interrompue le 2026-10-22 au soir, Claude Code s'étant fermé pendant la mesure. Aucun résultat sur le disque ; le message de `d995b62` renvoie au « compte rendu de la session », perdu avec elle. À refaire, en notant l'état de la machine. Relevé après la fermeture : aucun serveur Vite, Playwright ou Chromium de test ne tournait encore.

`cb187e3` `fix(frontend)` : `DemandeAccesPage`.
- Constat corrigé : à 360 px, la carte `w-96` ne débordait pas (`scrollWidth` 360), mais touchait les deux bords (carte de 0 à 360). Après : `w-full max-w-sm` dans un conteneur `px-4`, carte de 16 à 344 ; 1366 px inchangé (carte de 491 à 875). Mesure Playwright (un seul Chromium headless, API simulée), formulaire et confirmation, vue échouer avant sur la marge de 16 px.
- Vouvoiement et promesses de la landing : « 14 jours d'essai gratuit, sans carte bancaire. », « Votre demande est examinée sous 24 h, puis vos accès vous sont envoyés par email. » (avant et après l'envoi). Libellés « Votre nom », « Nom de votre boutique ».
- Tests : `DemandeAccesPage.test.jsx`, 3 tests, chacun vu échouer avant pour la bonne raison (textes absents, tutoiement). Lint OK, build OK. `npm test` en local : 378 réussis, 5 dépassements du délai de 5 s dans 4 fichiers qui n'importent ni la page ni `App` (`PurchasesAchatACredit` ×2, `RefusAbonnementExpireHistoriqueClients`, `SubmissionStates`, `isolationHorsLigne`), en 1 011 s ; relancés seuls : 3 dépassements, `isolationHorsLigne` passe. Machine : 1,0 à 1,8 Go de RAM libre sur 7,9, 11 à 12 processus Chrome, application Codex ouverte. Aucun délai modifié ; la CI est passée.

`9395de9` `feat(tenants)` : `seed_demo`. Compte « demo », deux boutiques fictives, chacune avec un abonnement `ACTIF` d'un an (formule « 1 MOIS », réutilisée si elle existe, sinon créée avec les valeurs de la prod), 9 ventes passées par l'API. Refuse de tourner sans `DEBUG`, hors de localhost (hôte vide compris), et si le compte existe déjà. 8 tests ; suite backend 691 tests OK ; `check` et `makemigrations --check` sans changement.

## Landing page : plan validé le 2026-10-22

Décisions de Mahamadou (2026-10-22) :
1. Modèle : les 15 captures de la version ChatGPT Sites, dans `C:\Users\User\Desktop\landing-captures\`, hors du dépôt (ne jamais les y ajouter).
2. Outil : Vite sans framework, dans `landing/`, déployé comme un second projet Vercel sur `iwishop.app` (DNS Cloudflare, DNS only ; `www` redirigé vers `iwishop.app`). Activer sur les deux projets Vercel « ne pas redéployer si rien n'a changé dans le dossier racine ».
3. WhatsApp : numéro confirmé par Mahamadou le 2026-10-22, écrit seulement dans la configuration de la landing (un seul endroit, pas dans cette note) ; texte prérempli « Bonjour, je souhaite en savoir plus sur iwiShop. »
4. Prix affiché : « 15 000 FCFA / mois par boutique ».
5. Après l'essai : « Paiement par Orange Money, Moov Money ou en espèces. Activation par notre équipe. », avec un lien WhatsApp (le paiement en ligne reste fermé).
6. Délai de validation annoncé : « sous 24 h » (les demandes d'accès sont validées à la main).
7. Admin, relevé par Mahamadou le 2026-10-22 : « Essai gratuit » 14 jours, `actif=False`, prix passé de 3 000 à 0 (nom inchangé) ; « 1 MOIS » 30 jours, 15 000, actif ; « 3 MOIS » 90 jours, 45 000, actif.
8. Rappels de dettes en retard : retirés de la landing (voir « En attente, côté code »).
9. Données de démonstration : commande `seed_demo` dans le dépôt, qui refuse de tourner hors de localhost (testé). Captures de l'app prises sur la base locale seulement.
10. Mentions légales : Mahamadou Cissé, Bamako, Mali ; contact `contact@iwishop.app` (créé le 2026-10-22 avec Cloudflare Email Routing, réception pas encore testée) ; pas de RCCM ni de NIF pour l'instant, ne rien inventer.
11. Mesure d'audience : aucune.

Règle de contenu : ne promettre que ce que l'app fait (relu dans le code le 2026-10-22), avec ses limites :
- ventes hors ligne : ventes seulement, téléphone déjà connecté une fois, envoi au retour du réseau ;
- installation sur l'écran d'accueil ; factures PDF partageables (WhatsApp par le partage du téléphone) ; photos de produits ; unités de vente ;
- stock et alerte « stock bas » dans l'app seulement (ni SMS, ni email, ni notification du téléphone) ;
- crédits clients, fournisseurs et achats, dépenses, journal de caisse (Mobile Money est un mode enregistré : l'app n'encaisse rien) ;
- rapports avec export PDF et Excel, journal de caisse, assistant Iwi (30 questions par jour par défaut) : propriétaire seulement ;
- multi-boutiques : un compte, plusieurs boutiques, données séparées ; pas de vue regroupée ; une nouvelle boutique passe par une demande ; un abonnement par boutique ;
- après l'essai : données conservées, en lecture seule.
À ne pas écrire : paiement en ligne, accès immédiat, rappels de dettes, alerte avant la fin de l'abonnement (l'email ne part que si le propriétaire ouvre « Mon abonnement » dans les 3 derniers jours), sauvegardes automatiques (pas encore faites), code-barres, SMS, témoignages ou chiffres de clients (aucun client).

Essai gratuit (vérifié dans le code le 2026-10-22) : durée lue en base (`duree_jours`) ; l'accès dure du jour J au jour J+14 inclus (`abonnement_valide`), donc au moins 14 jours ; le formulaire de demande ne demande ni carte ni paiement ; aucun palier ne limite les fonctions (offre unique). Promesse « 14 jours, gratuit, sans carte bancaire » tenue.

Relevé pour un commit `fix(frontend)` à venir : `DemandeAccesPage.jsx` a une largeur fixe `w-96` (384 px) qui déborde sur un téléphone de 360 px, et tutoie (« Ta demande ») alors que la landing vouvoie. Corrigé le 2026-10-22 (`cb187e3`) ; la mesure a démenti le débordement : la carte, enfant flex, rétrécissait à 360 px mais touchait les deux bords (voir « Landing page : fait le 2026-10-22 »).

Découpage prévu (un diff et un « oui, commit » par commit, un push par livraison) :
1. `feat(landing)` : squelette Vite, configuration unique (liens, WhatsApp), `vercel.json`, tests de base (`node --test` sur `dist/`). Fait : `a0ce057`.
2. `feat(landing)` : textes de toutes les sections. Fait : `b61a853`.
3. `feat(landing)` : logo, icônes, captures WebP, image Open Graph (1200×630, moins de 300 Ko). Fait : `433e94b`.
4. `feat(landing)` : mentions légales et politique de confidentialité. Fait : `56b4606`.
5. `ci` : job `landing` (build et tests). Fait : `6ce6ce3`.
6. `fix(frontend)` : `DemandeAccesPage` à 360 px. Fait : `cb187e3`.
7. `docs` : cette note.
Ajoutés en route : `111bcd5` (robots.txt et sitemap.xml), `378793f` (passe de design), `d995b62` (animations en CSS), `9395de9` (`seed_demo`).
Budget de poids : premier affichage sous 150 Ko, page entière sous 500 Ko, chaque capture sous 60 Ko ; polices du système, aucun JavaScript livré.

Photo de produit : la livraison 1 est terminée (voir « Photo de produit : plan validé le 2026-10-15 »).

Après le premier client :
- photos des catégories ;
- photo de produit, livraison 2 : miniature, recherche avec miniatures dans l'écran de vente, réduction dans le navigateur, liens expirés ;
- Vercel Pro ;
- NIF et paiement en ligne (voir « Ouvrir un jour le paiement en ligne »).

Terminé et vérifié en prod le 2026-10-21 : chantier « nom de domaine » (voir « Vérifié en prod (2026-10-21) »).

Terminé et vérifié en prod le 2026-10-20 : chantier sécurité du paiement de l'abonnement (voir « Chantier sécurité : paiement de l'abonnement (2026-10-20) »).

## Chantier sécurité : paiement de l'abonnement (2026-10-20)

Terminé le 2026-10-20 : 7 commits et le commit docs `e06e9d6`, poussés ensemble, CI verte (run 39446591007), vérifiés en prod par Mahamadou (voir « Vérifié en prod »).

### Constats

- `creer-paiement/` sans contrôle de rôle (relevé le 2026-10-05) : `CreerPaiementView` n'appliquait que `IsAuthenticated`, un employé pouvait lancer le paiement de l'abonnement de sa boutique. Analyse du 2026-10-20 : risque faible côté argent (l'employé paie lui-même, l'argent va à la plateforme), mais une décision du propriétaire prise par un employé. Un compte d'une autre boutique était déjà bloqué par `boutique_de` (403, même message qu'un id inexistant).
- Prod en `PAYDUNYA_MODE=test` (lu par Mahamadou sur Render le 2026-10-20) : création de la facture et confirmation de serveur à serveur passaient toutes deux par la sandbox. Une facture payée en sandbox, sans argent réel, prolongeait donc un vrai abonnement ; rien ne l'empêchait dans le code.
- Vérification des données (Mahamadou, 2026-10-20, admin, lecture seule) : 7 `PaiementAbonnement`, tous avec un `invoice_token` qui commence par `test_` (sandbox), aucun en `Échec`.
  - 2 `Confirmé` : SoraShop (3 mois, 45 000 FCFA, 24 septembre) et Boutique 2 (1 mois, 15 000 FCFA, 23 septembre). SoraShop est la boutique du seul vrai client : son abonnement a été prolongé de 3 mois par un paiement de sandbox, sans argent réel. Boutique 2, OUATT-Service et Ma Boutique sont des boutiques de test.
  - 5 `En attente` : rien de crédité.
  - Rien n'est modifié dans les données.
- `PAYDUNYA_MODE` n'a jamais valu `live` en prod, à la connaissance de Mahamadou (compte marchand jamais validé, NIF manquant).

### Décisions (Mahamadou, 2026-10-20)

- Payer l'abonnement et choisir la formule : réservé au propriétaire de la boutique visée (principe du moindre privilège ; le propriétaire peut payer depuis son téléphone).
- `paiements-abonnement/<id>/` reste tel quel (lecture du statut par la boutique).
- L'onglet « Mon Abonnement » reste visible aux employés, en lecture seule, avec « Seul le propriétaire peut renouveler. ».
- Interrupteur côté serveur, sûr par défaut : `PAIEMENT_EN_LIGNE_ACTIF`, faux si absent. Garde-fou en plus : paiement en ligne ouvert seulement si l'interrupteur est allumé **et** `PAYDUNYA_MODE == 'live'`, ou en `DEBUG`. `DEBUG=False` sur Render (lu par Mahamadou le 2026-10-20) : le garde-fou protège la prod.
- Texte quand le paiement en ligne est fermé, sans coordonnées : « Paiement en ligne bientôt disponible : contactez-nous pour renouveler. ».
- On reste sur PayDunya. Chariow étudié puis écarté : pas de champ metadata dans le checkout, moyens de paiement au Mali, frais et versements non documentés, conçu pour les produits numériques. À régler avant le premier paiement en ligne d'un client : NIF et papiers demandés par PayDunya pour le compte marchand. En attendant : paiement hors ligne et prolongation à la main.
- SoraShop (3 mois crédités par la sandbox) : décision commerciale gérée par Mahamadou directement avec son client (2026-10-20). Rien n'est modifié dans les données.

### Commits (2026-10-20)

1. `fe0db66` `test(tenants)` : constat, un employé crée un paiement d'abonnement.
2. `31944df` `fix(tenants)` : `creer-paiement/` réservé au propriétaire (`IsOwner`) ; employé 403, aucune ligne, PayDunya pas appelé. Suite backend : 673 sur 673.
3. `2b7c52b` `fix(frontend)` : Mon Abonnement, boutons de paiement masqués pour l'employé (`est_proprietaire === false`). `npm test` : 361 sur 361.
4. `a7b6482` `test(accounts)` : `me/` renvoie `est_proprietaire` pour la boutique active (même règle qu'`IsOwner`).
5. `e381f92` `feat(tenants)` : interrupteur `PAIEMENT_EN_LIGNE_ACTIF` et garde-fou ; `creer-paiement/` en 503 avec le code `PAIEMENT_EN_LIGNE_INACTIF` ; `mon-abonnement/` expose `paiement_en_ligne_actif` ; `PAYDUNYA_MODE` passe dans `settings.py`. Suite backend : 681 sur 681.
6. `c6e06b8` `fix(tenants)` : webhook, rien n'est prolongé tant que le paiement en ligne est fermé (aucun appel PayDunya, paiement laissé `EN_ATTENTE`, `logger.error` avec `paiement_id` et `token`, réponse 200). Suite backend : 683 sur 683.
7. `08bf386` `feat(frontend)` : Mon Abonnement, boutons masqués quand le paiement en ligne est fermé ; un 503 `PAIEMENT_EN_LIGNE_INACTIF` sur un clic affiche le `detail` du serveur. `npm test` : 368 sur 368.

Pas de migration. Rien à configurer sur Render : `PAIEMENT_EN_LIGNE_ACTIF` absent vaut « fermé ». Tout se pousse ensemble (les 5 paiements sandbox `En attente` en prod ne doivent pas pouvoir être crédités entre le 5 et le 6) ; l'ordre de déploiement entre Render et Vercel n'a pas d'importance.

### Vérifié en prod (Mahamadou, 2026-10-20, après le déploiement de `e06e9d6`)

- CI verte sur `e06e9d6` (run 39446591007, jobs `backend` et `frontend` sous `ubuntu-24.04`).
- Employé de Boutique 2 : Mon Abonnement affiche « Seul le propriétaire peut renouveler. », formules visibles, aucun bouton.
- Propriétaire (compte admin, sur Ma Boutique, sans abonnement) : « Paiement en ligne bientôt disponible : contactez-nous pour renouveler. », formules visibles, aucun bouton.
- Admin, Paiements abonnement : 7 lignes, 5 `En attente`, 2 `Confirmé` (SoraShop, Boutique 2), inchangé.
- Bandeau J-3 sur Boutique 2 : normal, son abonnement (1 mois crédité par la sandbox le 23 septembre) finit le 23/10/2026.
- Boutique 2 prolongée à la main le 2026-10-20 par Mahamadou (première pratique de la procédure « Prolongation à la main », réussie) : `date_fin` = 2026-12-12, `reference_paiement` = `HORS_LIGNE-2026-10-20-test`. Vérifié : bandeau J-3 disparu, Mon Abonnement « Actif jusqu'au 12/12/2026 ».

### Prolongation à la main, en attendant le paiement en ligne

Admin Django → Abonnements → fiche de la boutique : repousser `date_fin`. Repousser `date_fin` remet `alerte_envoyee` à faux (`Abonnement.save()`), donc l'alerte J-3 repartira. Garder une trace du paiement hors ligne dans `reference_paiement` (par exemple `HORS_LIGNE-2026-10-20-espèces`) ; aucun mouvement n'est enregistré.

### Ouvrir un jour le paiement en ligne (dans l'ordre)

1. Compte marchand PayDunya validé (NIF, papiers).
2. `PAYDUNYA_MODE=live` sur Render.
3. Puis `PAIEMENT_EN_LIGNE_ACTIF=True` sur Render.
4. Puis test en prod sur la boutique de test, avec un vrai petit paiement.

Rappel : avec `PAYDUNYA_MODE=test` et `DEBUG=False`, l'interrupteur allumé ne suffit pas (garde-fou) : `creer-paiement/` reste en 503 et le webhook ne crédite rien.

Tests en sandbox en local : `.env` avec `PAYDUNYA_MODE=test`, `PAIEMENT_EN_LIGNE_ACTIF=True` et `DEBUG=True`. Les tests automatiques ne lisent pas cette variable : ils ouvrent le paiement avec `override_settings` (`paiement_en_ligne_ouvert` dans `tenants/tests.py`), et la CI ne la définit pas, donc le cas par défaut (fermé) reste celui qu'on teste.

## Nom de domaine : plan validé le 2026-10-19

Terminé et vérifié en prod le 2026-10-21 (voir « Vérifié en prod (2026-10-21) »).

Plan proposé le 2026-10-19 et validé par Mahamadou le même jour : option A, avec trois ajouts (2FA et renouvellement automatique chez le registraire, vérification de la Content-Security-Policy, décision sur les plans payants reportée). Simplifié le même jour : bandeau et redirection automatique retirés, car il n'y a qu'un seul client, qui n'a fait aucune vente et sera formé après le changement d'adresse.

Domaine (Mahamadou, 2026-10-19) : `iwishop.app`, chez Cloudflare Registrar (8,20 $ la première année, puis 14,20 $ par an ; `iwishop.com` déjà pris, `.africa` non vendu par Cloudflare). Acheté le 2026-10-21 (voir « Domaine acheté (2026-10-21) ») ; le commit 1 (`f641618`) est fait, poussé et vérifié en prod. API : `api.iwishop.app`. App : `gestion.iwishop.app` (sous-domaine choisi par Mahamadou le 2026-10-21). `iwishop.app` sans préfixe reste réservé à la landing page. `.app` est une extension qui impose HTTPS dans les navigateurs (liste de préchargement HSTS) : aucune adresse en `http://` ne marchera, ce qui ne change rien ici (Vercel et Render servent en HTTPS).

But : que Safari sur iPhone garde les cookies de l'API (`csrftoken`, cookie de rafraîchissement). Aujourd'hui, `iwishop.vercel.app` et `onrender.com` sont deux sites distincts, donc ces cookies sont des cookies tiers, bloqués par Safari.

### Domaine acheté (2026-10-21)

Relevé par Mahamadou le 2026-10-21 (date donnée par Mahamadou ; l'horloge du PC affichait le 2026-10-20) :
- `iwishop.app` chez Cloudflare Registrar, 8,20 $ la première année. Statut Active. Expiration le 2027-10-21.
- Renouvellement automatique activé : 14,20 $ par an, prélèvement prévu le 2027-09-21. À faire début septembre 2027 : vérifier que la carte a assez d'argent (voir « En attente, côté Mahamadou »).
- WHOIS privacy activée.
- DNSSEC activé par Mahamadou : Pending le 2026-10-21, actif sous 24 h d'après Cloudflare.
- Aucun enregistrement DNS créé pour l'instant.
- Sous-domaine de l'app choisi par Mahamadou le 2026-10-21 : `gestion.iwishop.app`. API : `api.iwishop.app`.

### Option retenue : sous-domaines

- A (retenue) : `gestion.iwishop.app` sur Vercel, `api.iwishop.app` sur Render. Même site, donc cookies acceptés par Safari. Envoi des photos direct vers Render (5 Mo, comme aujourd'hui), aucun délai ajouté, veille de Render inchangée (environ 1 minute au premier appel après 15 minutes sans requête). Safari limite à 7 jours les cookies posés par un sous-domaine qui pointe (CNAME) vers un autre hébergeur : c'est déjà la durée du cookie de rafraîchissement (`REFRESH_TOKEN_LIFETIME`), donc sans effet. CORS reste. Inconvénient : l'adresse de l'app change (voir « Changement d'adresse »).
- B (écartée) : réécriture `/api/*` sur Vercel vers Render. Raisons : `_ip_client` (`accounts/throttling.py`) lit l'IP du client en 3ᵉ position depuis la fin de `X-Forwarded-For`, mesurée pour client → Cloudflare → Render ; derrière Vercel, tous les clients partageraient la même IP, donc la même limite de 10 connexions par minute (même problème avec `CF-Connecting-IP` dans `tenants/throttling.py`). Taille d'envoi maximale non documentée pour une réécriture externe (la limite de 4,5 Mo citée ailleurs concerne les fonctions Vercel). Délai maximal de 120 s. Cache de Vercel à neutraliser (`x-vercel-enable-rewrite-caching: 0`). Trafic de l'API compté dans le quota Hobby.

Lu dans la documentation le 2026-10-19 : Render accepte les domaines personnalisés en plan gratuit (« Supported features » de la page Free) ; l'espace Hobby en inclut 2, puis 0,25 $ par mois par domaine ; certificat créé et renouvelé automatiquement ; l'adresse `onrender.com` reste active.

### Ce que fait Mahamadou

Avant l'achat :
1. Double authentification sur le compte du registraire (Cloudflare) : fait le 2026-10-19 (nouveau mot de passe fort, 2FA par application activé et testé, code demandé même avec la connexion Google, codes de secours sur papier ; Gmail aussi en 2FA par application).
2. Renouvellement automatique du domaine activé à l'achat (un domaine expiré met toute l'app hors ligne) : fait le 2026-10-21.

Puis :
3. Acheter `iwishop.app` (fait le 2026-10-21) et choisir le sous-domaine de l'app : `gestion` (choisi le 2026-10-21).
4. Render : Settings → Custom Domains → `api.iwishop.app`. Ne jamais désactiver l'adresse `onrender.com` : l'ancienne adresse de l'app et le webhook PayDunya l'utilisent.
5. Vercel : Domains → `gestion.iwishop.app` (certificat automatique ; le même déploiement sert les deux adresses).
6. DNS (chez Cloudflare) : `gestion` en CNAME vers la valeur donnée par Vercel ; `api` en CNAME vers `<service>.onrender.com` ; aucun enregistrement AAAA (demandé par Render). Nuage gris (« DNS only »), surtout pour `api` : un nuage orange ajoute un intermédiaire et décale la position de l'IP lue par `_ip_client`.
7. Variables sur Render, en ajout seulement : `ALLOWED_HOSTS` += `api.iwishop.app` ; `CORS_ALLOWED_ORIGINS` += `https://gestion.iwishop.app` ; `CSRF_TRUSTED_ORIGINS` += `https://gestion.iwishop.app`. Avant la formation du client : `FRONTEND_URL` = `https://gestion.iwishop.app`.
8. Donner les valeurs actuelles (sans secret) de `JWT_REFRESH_COOKIE_SAMESITE`, `JWT_REFRESH_COOKIE_DOMAIN` et `CSRF_COOKIE_SAMESITE` (Render), et de `VITE_API_URL` (Vercel) : illisibles depuis le dépôt.
9. Avant le changement d'adresse : sur les appareils de test (iPhone et PC), sur l'ancienne adresse, vérifier qu'aucune vente n'est en attente (pas de bandeau orange).

### Configuration faite (2026-10-21)

Fait et relevé par Mahamadou le 2026-10-21, backend d'abord :
- Render : `api.iwishop.app` ajouté (Verified, Certificate Issued). Cloudflare : CNAME `api` → `iwishop.onrender.com`, DNS only.
- Variables Render : `ALLOWED_HOSTS` = `.onrender.com,api.iwishop.app` ; `CORS_ALLOWED_ORIGINS` et `CSRF_TRUSTED_ORIGINS` = `https://iwishop.vercel.app,https://gestion.iwishop.app`. `FRONTEND_URL` inchangée.
- `https://api.iwishop.app/api/csrf/` répond en JSON, cadenas valide (constat de Mahamadou).
- Vercel : `gestion.iwishop.app` ajouté (Valid Configuration, Production, branche `main`). Cloudflare : CNAME `gestion` → `efbe0aee3b3a30e5.vercel-dns-017.com`, DNS only.
- Valeurs relevées (étape 8) : `CSRF_COOKIE_SAMESITE=None`, `JWT_REFRESH_COOKIE_SAMESITE=None`, `JWT_REFRESH_COOKIE_DOMAIN` absente (donc `Domain` vide, comme prévu). `VITE_API_URL` est marquée « Sensitive » sur Vercel (illisible) ; d'après l'onglet Réseau, l'app appelle `https://iwishop.onrender.com/api/`.
- Ancienne adresse `iwishop.vercel.app` après le changement de CORS : marche (connexion ; `accounts/me/` en 200 avec `Access-Control-Allow-Origin: https://iwishop.vercel.app` et `Access-Control-Allow-Credentials: true` ; tableau de bord affiché).
- Remarque de Mahamadou : la réponse de `iwishop.onrender.com` porte un en-tête `Cf-Ray` (…-DKR) : Render passe lui-même par Cloudflare, même avec un enregistrement « DNS only » chez nous.
- Étape 9 (appareils de test sans vente en attente) : faite avant la redirection (voir « Vérifié en prod (2026-10-21) »).

### Vérifié en prod (2026-10-21)

- Commits poussés le 2026-10-21, CI verte : `61a8d6e` (`revert(accounts)`, retire `DIAG_XFF` ; run 39672128439) et `27e3f59` (`feat(frontend)`, commit 2 ; run 39676353984).
- Étape 9, faite avant la redirection (Mahamadou) : PC et iPhone, aucune vente en attente. Vérifié en plus à la source sur le PC : IndexedDB `sorashop-offline`, store `ventes_en_attente` de `iwishop.vercel.app`, « Total d'entrées : 0 » ; puis données du site effacées.
- Déconnexion sur `gestion.iwishop.app` : `POST /api/token/logout/` en 204 dans les journaux de Render (relevé par Mahamadou), depuis Chrome sur PC, depuis l'app Google (GSA) sur iPhone et depuis Safari sur iPhone (`Version/26.0.1 Mobile Safari`). Le défaut Safari du 2026-10-19 (déconnexion en 403) est réglé.
- `FRONTEND_URL` = `https://gestion.iwishop.app` sur Render (Mahamadou).
- `iwishop.vercel.app` redirige en 308 vers `gestion.iwishop.app`, chemin conservé. Vérifié avec curl le 2026-10-21 à 22 h 42 UTC : `https://iwishop.vercel.app` → `Location: https://gestion.iwishop.app/` ; `https://iwishop.vercel.app/demande-acces` → `Location: https://gestion.iwishop.app/demande-acces` ; `Server: Vercel`. Une 308 est gardée en cache par les navigateurs : la retirer plus tard ne ramène pas forcément un appareil qui l'a déjà reçue.
- Abandonné (Mahamadou, 2026-10-21) : la redirection prévue de `iwishop.app` vers `gestion`. `iwishop.app` recevra la landing page.
- Non relevés dans cette note : rechargement et action après plus de 15 minutes sans reconnexion, attributs du cookie de rafraîchissement, photo de près de 5 Mo, premier appel après une veille de Render, facture PayDunya créée puis annulée, lien de l'email de demande d'accès, Sentry (voir « Tests »).

### Changements dans le code et la config

- `ALLOWED_HOSTS`, CORS, `CSRF_TRUSTED_ORIGINS` : variables seulement, aucun code.
- Cookies (`settings.py`) : aucun changement. `Domain` reste vide (cookies attachés à `api.iwishop.app` seul ; `api.js` lit le jeton CSRF dans la réponse de `csrf/`, pas dans `document.cookie`). `Secure` gardé. `SameSite=None` gardé tant que l'ancienne adresse appelle `onrender.com` depuis un autre site.
- URL de l'API côté frontend : aujourd'hui en trois copies (`api.js`, `App.jsx`, `Settings.jsx`), à réunir dans un seul module. Choisie selon l'adresse de la page : sur `gestion.iwishop.app`, `https://api.iwishop.app/api/` ; ailleurs, `VITE_API_URL`, inchangée ; variable absente : comportement actuel. L'ancienne adresse ne change pas, ses utilisateurs ne sont pas déconnectés.
- Liens des emails (`tenants/emails.py`) et retour de paiement (`return_url`, `cancel_url`, `tenants/paydunya.py`) : viennent de `FRONTEND_URL`, variable seulement. `callback_url` (`BACKEND_URL`) reste sur `onrender.com`. Une facture créée avant le changement renvoie vers l'ancienne adresse, qui reste en ligne.
- Adresses écrites en dur : aucune dans le code (recherche du 2026-10-19), seulement un exemple en commentaire (`settings.py`, CORS).
- PWA : manifeste en chemins relatifs, rien à changer. La nouvelle adresse est une nouvelle app (service worker et installation séparés).
- HSTS : inchangé.
- Content-Security-Policy : aucune (vérifié le 2026-10-19 : pas d'en-tête dans `vercel.json`, pas de balise `<meta http-equiv>` dans `index.html`, ni `SECURE_CSP` ni middleware CSP dans `settings.py`, pas de `django-csp` dans `requirements.txt`). Rien à changer. Si une CSP est ajoutée un jour, `connect-src` devra lister `api.iwishop.app` et l'adresse `onrender.com` (ancienne adresse), et `img-src` l'adresse des URL signées de R2.

### Changement d'adresse

Pourquoi c'est simple : un seul client, aucune vente chez lui, formé après le changement d'adresse.

IndexedDB et `localStorage` sont liés à l'adresse exacte : les ventes en attente sur `iwishop.vercel.app` ne sont pas visibles depuis `gestion.iwishop.app`. D'où l'étape 9 de « Ce que fait Mahamadou » sur les appareils de test.

- L'ancienne adresse reste en marche (même projet Vercel, coût nul, comportement inchangé), sans bandeau ni redirection. Changé le 2026-10-21 : elle redirige en 308 vers `gestion.iwishop.app` (voir « Vérifié en prod (2026-10-21) »).
- Le client est formé directement sur la nouvelle adresse et l'installe sur son écran d'accueil.

### Retour en arrière

- Backend : seulement des valeurs ajoutées aux variables ; les retirer suffit. Pas de migration.
- Frontend : « Instant Rollback » de Vercel, ou variable de la nouvelle adresse vidée puis redéploiement. L'ancienne adresse n'est jamais touchée.
- DNS : retirer les enregistrements.
- Limite : des ventes en file sur la nouvelle adresse y restent tant qu'elle est en panne. Donc la formation du client n'a lieu qu'après les tests en prod sur la boutique de test.

### Tests

Automatiques (frontend), chacun vu échouer avant le correctif :
- URL de l'API : `gestion.iwishop.app` → `https://api.iwishop.app/api/` ; `iwishop.vercel.app` → `VITE_API_URL` ; variables absentes → valeur locale par défaut ; URL des logos déduite de la même façon.
- Backend : aucun changement de code prévu. Si la mesure de l'IP l'impose, `_ip_client` change dans un commit à part, avec ses tests.

En prod, avant de changer le frontend (bloquant) :
1. `curl https://api.iwishop.app/api/csrf/` : 200, certificat valide, attributs de `Set-Cookie`.
2. Requête de vérification CORS : acceptée depuis `https://gestion.iwishop.app`, refusée depuis une origine non listée.
3. Nouvelle mesure de `X-Forwarded-For` sur `api.iwishop.app`, avec et sans en-tête falsifié, dans les journaux de Render (méthode du commentaire de `_ip_client`). Si la vraie IP n'est plus en 3ᵉ position depuis la fin, on s'arrête.

Résultats (points 1 et 2 : curl depuis le PC de Mahamadou, 2026-10-21 vers 19 h 14 UTC) :
- 1, fait : `GET https://api.iwishop.app/api/csrf/` en 200, JSON. Certificat valide (vérification OK) : `CN=api.iwishop.app`, émis par Google Trust Services (WE1), du 2026-10-21 au 2027-01-19. `Set-Cookie: csrftoken=… ; Max-Age=31449600 ; Path=/ ; SameSite=None ; Secure`, sans `Domain` (cookie attaché à `api.iwishop.app` seul), sans `HttpOnly` (normal pour `csrftoken`). `Server: cloudflare`, `CF-RAY: …-DKR`, `x-render-origin-server: gunicorn`, `strict-transport-security: max-age=300`. Le cookie de rafraîchissement n'est posé qu'à la connexion : ses attributs seront relevés pendant les tests sur la boutique de test.
- 2, fait : prévol `OPTIONS /api/token/refresh/` (POST ; en-têtes `content-type`, `x-csrftoken`, `authorization`, `x-boutique-active`). Depuis `https://gestion.iwishop.app` : 200 avec `Access-Control-Allow-Origin: https://gestion.iwishop.app`, `Access-Control-Allow-Credentials: true`, les quatre en-têtes autorisés. Depuis `https://exemple-non-liste.com` : 200 sans aucun en-tête `Access-Control-Allow-*`, donc refusé par le navigateur. Même résultat sur `GET /api/csrf/`. À noter, sans effet : `x-csrftoken` apparaît deux fois dans `Access-Control-Allow-Headers`.
- 3, réussi le 2026-10-21. Les journaux de Render ne montrent pas `X-Forwarded-For` (journaux de requêtes HTTP réservés à l'espace Pro, sans IP ni cet en-tête, d'après la documentation de Render lue le 2026-10-21 ; le journal `DIAG_XFF` de septembre, `a4cf9a0`, avait été retiré par `bf49d58`). D'où un journal temporaire, `e8ef558` (`diag(accounts)`, écrit seulement pour l'identifiant exact `diag-xff`, jamais le mot de passe), poussé le 2026-10-21, CI verte (run 39665389814), Live sur Render. 4 requêtes `POST /api/token/` avec `diag-xff` depuis le PC de Mahamadou, 19 h 58 UTC, toutes en 401 ; 4 lignes `DIAG_XFF` relevées par Mahamadou dans les journaux de Render, dans l'ordre (IP réelle notée `IP_CLIENT`, jamais écrite ici) :
  1. `api.iwishop.app`, sans en-tête : `IP_CLIENT, <relais Cloudflare>, <proxy Render 10.x>`.
  2. `api.iwishop.app`, `X-Forwarded-For: 1.2.3.4` envoyé : `1.2.3.4, IP_CLIENT, <relais Cloudflare>, <proxy Render 10.x>`.
  3. `iwishop.onrender.com`, sans en-tête : même forme que 1.
  4. `iwishop.onrender.com`, `1.2.3.4` envoyé : même forme que 2.
  - Dans les 4 cas, `IP_CLIENT` est en 3ᵉ position depuis la fin (ce que lit `_ip_client`) et `1.2.3.4` n'y est jamais. `CF-Connecting-IP` vaut `IP_CLIENT` dans les 4 cas (lu par `tenants/throttling.py`). `REMOTE_ADDR` vaut `127.0.0.1` partout. Le relais Cloudflare et le proxy Render changent d'une requête à l'autre (plages `172.69.x` ou `104.23.x`, et `10.x`), mais il y en a toujours exactement un de chaque : même chaîne qu'en septembre, sur les deux adresses. Lecture faite par Mahamadou et vérifiée par Claude le 2026-10-21. Conclusion : `fix(accounts)` inutile, `_ip_client` ne change pas.
  - Limite : mesure faite depuis un seul réseau, celui de Mahamadou, comme en septembre.

En prod, boutique de test :
- iPhone Safari sur `gestion.iwishop.app` : connexion ; rechargement sans retour à l'écran de connexion ; après plus de 15 minutes (par exemple 20), une action passe sans reconnexion ; déconnexion avec `POST /api/token/logout/` en 204 dans les journaux de Render ; rechargement après la déconnexion : écran de connexion.
- PC Chrome : mêmes étapes.
- Photo de près de 5 Mo envoyée depuis la nouvelle adresse.
- Premier appel après une veille de Render : il passe (environ 1 minute).
- Ancienne adresse : comportement inchangé (connexion et une vente). Remplacé le 2026-10-21 par la redirection 308 vers `gestion.iwishop.app`.
- Après le changement de `FRONTEND_URL` : facture PayDunya créée puis annulée, retour sur la nouvelle adresse (sans payer) ; demande d'accès, lien de l'email vers la nouvelle adresse.
- Sentry : aucune nouvelle erreur.

### Découpage

Sans commit (Mahamadou) : registraire, domaine, DNS, Render, Vercel, variables, appareils de test vérifiés ; puis les vérifications bloquantes.

Une seule livraison :
1. `refactor(frontend)` : une seule source pour l'URL de l'API (`api.js`, `App.jsx`, `Settings.jsx`), sans changement de comportement. Fait : `f641618`, poussé ; vérifié en prod le 2026-10-19 (Mahamadou) : CI verte sur `f641618` (run 39283736188), produits chargés (`api.js`), logo affiché dans Paramètres et en haut de l'app.
2. `feat(frontend)` : URL de l'API choisie selon l'adresse de la page, avec ses tests. Fait : `27e3f59`, poussé le 2026-10-21, CI verte (run 39676353984).
3. Seulement si la mesure l'impose : `fix(accounts)` : IP du client derrière `api.iwishop.app`. Inutile (mesure du 2026-10-21, vérification 3). À la place : `diag(accounts)` (`e8ef558`, poussé le 2026-10-21), puis `61a8d6e` (`revert(accounts)`, poussé le 2026-10-21, CI verte, run 39672128439), qui retire ce diagnostic.
4. `docs` : `EN_COURS.md`.

### Décisions pour plus tard

- Plans payants (Mahamadou, 2026-10-19) : plan Hobby de Vercel, réservé à un usage « non commercial, personnel » (documentation Vercel, lue le 2026-10-19 ; Pro à 20 $ par mois), et plan payant du service web Render (aujourd'hui gratuit, avec mise en veille). Décidé le 2026-10-21 : Render en plan payant dans la liste « prêt à vendre », Vercel Pro après le premier client (voir « Prochaines étapes »).
- Plus tard (Mahamadou, 2026-10-21) :
  - retirer `iwishop.vercel.app` de CORS et de `CSRF_TRUSTED_ORIGINS` (l'ancienne adresse redirige vers `gestion.iwishop.app` depuis le 2026-10-21) ;
  - cookies en `SameSite=Lax` ;
  - `ALLOWED_HOSTS` en `iwishop.onrender.com` au lieu de `.onrender.com`, qui accepte tout sous-domaine de Render (relevé par Mahamadou le 2026-10-21).

## Photo de produit : plan validé le 2026-10-15

Plan proposé et validé par Mahamadou le 2026-10-15 : D1 à D8 acceptées, avec deux ajouts (test HEIC sur un vrai iPhone et message de refus, à D2 ; URL signées et cache des miniatures, en livraison 2).

État : commit 1 (`a561005`, `traiter_photo`) fait le 2026-10-15 ; vérifications en prod faites le 2026-10-16 (voir plus bas) ; commits 2 (`b047434`), 2 bis (`bba2b20`), 3 (`43c3ab0`) et 4 (`ec6e689`) faits le 2026-10-16. Rien n'est poussé : push à la fin de la livraison 1 (décidé par Mahamadou le 2026-10-16). `.env` local passé au stockage local et vérification à l'œil en local faites le 2026-10-16 (voir plus bas). Commit 5 (`14a7043`, `docs`) fait ; livraison 1 poussée le 2026-10-16 (`20b0ac0..14a7043`, CI verte, run 38945554155, backend et frontend) et vérifiée en prod le même jour (voir « Test en prod de la livraison 1 »), sauf iPhone (HEIC) et photo prise avec l'appareil photo. Les exigences viennent de Mahamadou (une photo par produit, compression à environ 800 px, vérification du vrai type de fichier, stockage R2 par boutique, suppression avec le produit, image par défaut hors ligne, médias non sauvegardés) : elles n'étaient pas encore écrites dans ce fichier.

### Constats dans le code (2026-10-15)

- `Produit.photo` existe déjà : `ImageField`, `upload_to='produits/'` (dossier commun à toutes les boutiques), extensions JPG, JPEG, PNG, WEBP et 5 Mo maximum (`tenants/validators.py`) ; Pillow vérifie seulement que le fichier se décode. Ni compression, ni retrait des métadonnées EXIF (la position GPS d'une photo de téléphone est gardée). Remplacer ou retirer une photo ne supprime jamais l'ancien fichier. La photo s'envoie en multipart avec le produit (`ProduitSerializer`, `fields='__all__'`).
- Droits sur les produits : tout vendeur peut modifier un produit ; seul le propriétaire peut le supprimer, et la suppression est refusée (400) si le produit a des ventes, achats ou mouvements de stock.
- Stockage : R2 privé, URL signées qui expirent au bout d'une heure (`AWS_QUERYSTRING_AUTH` non défini, défaut de django-storages).
- Frontend : aucun écran n'affiche ni n'envoie de photo de produit. Le catalogue hors ligne (`catalogueCache`) garde les produits tels que l'API les renvoie, avec des URL signées qui expirent.
- Base de dev : 4 produits, aucun avec photo. Prod (2026-10-16) : 5 produits, aucun avec photo (voir « Vérifications en prod »).

### Décisions (validées par Mahamadou le 2026-10-15)

1. D1. Sortie en WebP qualité 80, 800 px au plus sur le plus grand côté, jamais d'agrandissement. Environ 30 à 80 Ko par photo ; WebP 25 à 35 % plus léger que JPEG, lu par tous les navigateurs récents.
2. D2. Entrée : 5 Mo maximum (inchangé), 40 mégapixels maximum (« bombes de décompression »), JPEG, PNG ou WebP selon le format lu par Pillow dans le contenu, quelle que soit l'extension. Refusé avec un message clair : GIF, SVG, HEIC d'iPhone, texte renommé en `.jpg`. Message de ces refus : « Format d'image non accepté. Choisissez une photo JPG ou PNG. » (Pillow ne lit pas le HEIC : il passe par le même chemin qu'un fichier illisible). Image animée : seule la première image est gardée. À tester sur un vrai iPhone : Safari convertit la photo HEIC en JPEG à l'envoi (voir « Test en prod de la livraison 1 »).
3. D3. Toujours ré-encoder : le fichier envoyé n'est jamais stocké tel quel. Orientation EXIF appliquée, puis toutes les métadonnées supprimées (GPS compris). Transparence d'un PNG gardée.
4. D4. Chemin `produits/<id de la boutique>/<uuid>.webp`, dans le bucket médias actuel, qui reste privé avec des URL signées. Le nom de fichier envoyé n'est jamais utilisé ; nouveau nom à chaque envoi.
5. D5. API dédiée : `POST /api/produits/{id}/photo/` (multipart, champ `photo`) et `DELETE /api/produits/{id}/photo/`. Dans le produit, `photo` passe en lecture seule (son URL).
6. D6. Droits : envoyer ou retirer une photo est permis à quiconque peut modifier un produit (employés compris, comme aujourd'hui). Supprimer le produit reste réservé au propriétaire.
7. D7. Hors ligne : image par défaut, pas de mise en cache des photos en phase 1 (les URL signées expirent au bout d'une heure).
8. D8. Les photos restent hors de la sauvegarde de la base (une photo perdue se renvoie). À revoir avec la reprise de la sauvegarde.

### Validation et sécurité de l'envoi

- Ordre des contrôles : taille, puis ouverture par Pillow avec la limite de pixels, puis format réel. Toute erreur donne un 400 avec un message, jamais un 500.
- Accès : produit d'une autre boutique, même 404 qu'un produit inexistant ; abonnement expiré, 403 ; Vue Support refusée (écriture).
- Le ré-encodage neutralise tout contenu caché dans le fichier d'origine.

### Compression

Pillow, déjà installé (12.3.0) et déjà utilisé par `ImageField` : aucune nouvelle dépendance ; orientation, redimensionnement et WebP. `pyvips`, plus rapide, demanderait une bibliothèque système sur Render et sous Windows. Le traitement est une fonction pure, `traiter_photo(fichier) -> octets WebP`, testable sans base ni stockage.

### Suppression

- L'ancien fichier est supprimé après le commit (`transaction.on_commit`) : au remplacement, au retrait, et à la suppression réussie du produit.
- Si la base échoue après l'envoi, le nouveau fichier est supprimé.
- Un échec de suppression dans R2 est journalisé en ERROR (événement Sentry), sans bloquer la requête : au pire, un fichier orphelin reste dans le bucket.
- Supprimer une boutique laisserait ses fichiers en place : à noter, aucune boutique ne se supprime aujourd'hui.

### Écrans React

- Fiche produit : « Choisir une photo » (`accept="image/jpeg,image/png,image/webp"`, qui propose aussi l'appareil photo sur téléphone), aperçu, envoi avec état « en cours », « Retirer la photo ». Erreurs dans la page, double clic ignoré, actions désactivées en Vue Support. À la création : le produit est enregistré d'abord, puis la photo est envoyée ; si l'envoi échoue, le message dit « produit créé, photo non envoyée ».
- Liste des produits : miniature, sinon image par défaut dans quatre cas : pas de photo, champ absent (backend pas encore déployé), image qui ne se charge pas (`onError`, par exemple URL expirée), catalogue hors ligne.

### Tests

- Backend : dimensions de sortie (rapport gardé, pas d'agrandissement) ; WebP ; EXIF supprimé (photo de test avec GPS) et orientation appliquée ; transparence gardée ; vrai type (PNG nommé `.jpg` accepté ; texte nommé `.jpg`, GIF, SVG et HEIC refusés avec le message de D2) ; 5 Mo et 40 mégapixels ; chemin par boutique sans le nom d'origine (par exemple `../../x.php.jpg`) ; suppression après commit (remplacement, retrait, suppression du produit) et pas de suppression si la base échoue ; échec de R2 journalisé sans bloquer ; 404 identique pour une autre boutique, Vue Support, abonnement expiré, employé autorisé ; nombre de requêtes de la liste inchangé. Fichiers comptés dans le stockage en mémoire ; chaque correctif vu échouer avant.
- Frontend : envoi en `FormData` et aperçu ; erreur dans la page et double clic ; retrait ; image par défaut dans les quatre cas ; Vue Support.

### Découpage proposé

Livraison 1 (fonction complète en ligne, image par défaut hors ligne) :
1. `feat(products)` : `traiter_photo` (Pillow : vrai type, limite de pixels, EXIF et orientation, 800 px, WebP), avec ses tests.
   - Fait : `a561005` (2026-10-15, non poussé). 14 tests, vus échouer sans l'orientation, sans le contrôle du format, avec le décodage avant le contrôle des pixels, sans la bombe rattrapée, avec agrandissement, avec EXIF ou ICC repassés à l'enregistrement. Suite backend : 644 OK. Pillow 12 n'écrit dans un WebP que les métadonnées passées en option à `save()` ; `info.clear()` gardé par précaution.
2. `feat(products)` : API `POST`/`DELETE` de la photo, chemin par boutique, suppression après commit, `photo` en lecture seule, avec ses tests. Migration de `upload_to` : changement d'état seulement, à vérifier avec `sqlmigrate`.
   - Fait : `b047434` (2026-10-16, non poussé). `POST` et `DELETE` répondent 200 avec le produit ; une photo envoyée avec le produit (`POST`/`PUT`/`PATCH produits/`) est ignorée sans erreur (deux choix validés par Mahamadou le 2026-10-16). Fichier écrit avant la transaction, produit verrouillé (`select_for_update`), ancien fichier supprimé par `on_commit`, nouveau fichier supprimé si la base échoue. Migration `products/0015` : `sqlmigrate` affiche `-- (no-op)`. 19 tests (dont un de concurrence sur PostgreSQL), qui remplacent les 5 tests d'envoi par le produit ; 9 contre-épreuves, toutes vues échouer. Suite backend : 658 OK, `check` et `makemigrations --check` OK.
   - 2 bis. `bba2b20` (2026-10-16, non poussé) : « plan validé le 2026-10-16 » corrigé en « 2026-10-15 » dans deux commentaires du commit 1.
3. `feat(frontend)` : la photo dans la fiche produit.
   - Fait : `43c3ab0` (2026-10-16, non poussé). Photo choisie, changée ou retirée dans la fiche, envoyée à l'enregistrement seulement, après le produit et ses prix (aussi en modification : « Annuler » n'envoie rien). Échec de la photo : fenêtre fermée, message dans la page (« Produit créé, photo non envoyée : … »). Composant `PhotoProduit` (image par défaut). 9 tests, 7 contre-épreuves vues échouer. Premier test au bord du délai de 5 s : mesuré étape par étape (environ 4 s dans six saisies user-event), remplacées par `fireEvent.change`, délai inchangé ; 3 034 ms sur 5 000 dans la suite complète (1,8 Go de RAM libre, 16 processus Chrome).
4. `feat(frontend)` : la miniature dans la liste, et l'image par défaut.
   - Fait : `ec6e689` (2026-10-16, non poussé). Miniature de 40 px (`loading="lazy"`) à la place de l'initiale ; hors ligne, aucune photo demandée au réseau, retour de la miniature avec la connexion ; aperçu local gardé hors ligne. 4 tests, 4 contre-épreuves vues échouer. Frontend : lint, 290 tests et build OK.
5. `docs` : `EN_COURS.md`.

Livraison 2 : décisions de Mahamadou du 2026-10-16, sur le plan proposé le même jour (rien n'est codé) :
1. Écran de vente : champ de recherche avec liste de résultats illustrés (miniature, nom, stock, prix renvoyé par l'API), à la place du `<select>` ; pas de grille.
2. Pas de cache hors ligne des photos pour l'instant : livraison 2b (cache des miniatures dans IndexedDB, avec règle CORS sur `iwishop-media`) en attente. D7 inchangée (image par défaut hors ligne).
3. Miniature de 160 px générée par le serveur à l'envoi : oui (champ `photo_miniature`, migration additive).
4. Réduction dans le navigateur avant l'envoi : 1 200 px au plus (le serveur ne garde que 800 px ; pas de 1 600 px, inutile pour l'instant).
5. sRGB : attendre une comparaison sur un vrai iPhone.
6. Bucket public pour les photos : à décider avec le chantier du site public.
7. Priorité : vérifier l'isolation du catalogue hors ligne et de la file des ventes hors ligne (boutique, utilisateur, déconnexion), sans rien corriger : voir « Constat : isolation hors ligne ». Fait, puis corrigé : livraisons A et B, terminées et vérifiées en prod le 2026-10-19 (voir « Correction de l'isolation hors ligne »).

Découpage retenu, à confirmer après le constat : livraison 2a = miniature de 160 px (backend), commande `generer_miniatures`, sélecteur avec recherche et miniatures, miniature dans la liste et le sélecteur avec rechargement des URL expirées, `docs` ; livraison 2c = réduction dans le navigateur (1 200 px), puis sRGB si la comparaison le justifie, `docs`.

Pistes de la livraison 2, avant ces décisions :
- Réduction de la photo dans le navigateur avant l'envoi (économie de données mobiles, le serveur garde tous ses contrôles).
- Photo dans l'écran de vente.
- Cache des miniatures (relevé par Mahamadou le 2026-10-15) : les URL signées changent à chaque chargement de la liste, donc le navigateur ne garde pas les miniatures en cache et les retélécharge à chaque visite (données mobiles). Options : URL signées plus longues, ou cache (par exemple par le chemin du fichier, sans la signature).
- Conversion vers sRGB pour les photos d'iPhone (relevé le 2026-10-15) : D3 retire le profil couleur ICC, et les photos d'iPhone (Display P3) peuvent alors paraître un peu plus ternes. Convertir vers sRGB avant l'enregistrement, si c'est visible sur un vrai téléphone.

### Constat : isolation hors ligne (2026-10-16, rien n'est corrigé)

Demandé en priorité par Mahamadou le 2026-10-16. Preuve : `sorashop-frontend/src/services/isolationHorsLigne.constat.test.js` (non suivi par git, jamais commité ; ses trois parties ont été inversées dans `isolationHorsLigne.test.js` par les commits 3, 4 et 5 de la livraison B, puis le fichier a été supprimé le 2026-10-16), 3 tests qui passaient avant la correction : vraie IndexedDB en mémoire (`fake-indexeddb`), vrai `api.js` avec ses intercepteurs, seul le réseau d'axios remplacé pour lire les requêtes envoyées.

- Catalogue hors ligne (`catalogueCache.js`) : une seule entrée, `{produits, prix, unites, derniere_maj}`, sans boutique ni utilisateur. Une fois la boutique active passée de 1 à 2, `chargerCatalogueCache()` rend le catalogue de la boutique 1 (prix d'achat compris). `Sales.jsx` l'affiche hors ligne sans contrôle de boutique. Gardé après la déconnexion.
- File des ventes hors ligne (`offlineQueue.js`) : chaque entrée ne garde que `cle_idempotence`, `payload`, `horodatage_client`, `statut`, `tentatives` ; ni boutique ni utilisateur. Gardée après la déconnexion. `syncEngine.js` rejoue toutes les ventes `EN_ATTENTE` et `ECHEC_AUTRE` avec l'en-tête `X-Boutique-Active` et le jeton du moment de la synchronisation : prouvé avec une vente faite par X dans la boutique 1, envoyée après déconnexion de X et connexion de Y dans la boutique 2 (`X-Boutique-Active: 2`, `Bearer jeton-de-Y`).
- Déconnexion (`api.logout`, appelée par `AuthContext.logout`) : n'efface que le jeton d'accès (et le cookie côté serveur). `boutique_active_id` reste aussi dans `localStorage`.
- Conséquences, d'après le backend (`sales/serializers.py`) :
  - Autre boutique : produit refusé en 400 (« n'appartient pas à votre boutique »), vente en `ECHEC_AUTRE`, retentée à chaque synchronisation ; elle passe si l'on revient sur la bonne boutique. Pas de perte, pas d'écriture dans la mauvaise boutique (les identifiants de produit sont uniques sur toute la base).
  - Même boutique, autre utilisateur (deux vendeurs sur un même téléphone) : la vente est acceptée et enregistrée avec Y comme vendeur (`utilisateur = request.user`), sans aucun signal. Risque principal : mauvaise attribution du vendeur.
  - Catalogue d'une autre boutique affiché hors ligne : une vente faite avec ce catalogue finit en `ECHEC_AUTRE` ; et un utilisateur d'une autre boutique, sur le même appareil, voit hors ligne le catalogue de la précédente (prix d'achat compris).
- Point de vigilance pour la correction : effacer la file des ventes à la déconnexion perdrait des ventes non envoyées (de l'argent). Piste : marquer chaque vente et le catalogue avec l'utilisateur et la boutique à la création, ne rejouer que les ventes de l'utilisateur et de la boutique en cours, prévenir à la déconnexion s'il reste des ventes non envoyées ; effacer seulement le catalogue. Ventes déjà en file sans marque : voir le plan ci-dessous. Correction planifiée le 2026-10-16, avant la livraison 2a.

### Correction de l'isolation hors ligne : plan validé le 2026-10-16

Contraintes posées par Mahamadou et plan validé le 2026-10-16, avec ses trois réponses (409 avant la clé d'idempotence ; tout vendeur peut envoyer une vente sans marque après confirmation explicite ; refus d'une vente hors ligne si le contexte est inconnu). La condition ajoutée à la réponse 3 (contexte enregistré durablement, pour vendre après un rechargement hors ligne) a été retirée par Mahamadou le 2026-10-16 : voir « Décision : seule la page Ventes marche hors ligne ». Passe avant la livraison 2a de la photo.

1. Aucune vente non envoyée n'est jamais effacée : une entrée de la file ne disparaît qu'après un envoi réussi, comme aujourd'hui ; pas de bouton « supprimer ».
2. Marque : `accounts/me/` renvoie aussi `boutique_id` (ajout). Contexte de session `{utilisateur_id, utilisateur_nom, boutique_id, boutique_nom}` recopié de `accounts/me/` à chaque chargement en ligne, gardé en mémoire (module lisible par `syncEngine`, hors de React), effacé à la déconnexion volontaire. Pas d'enregistrement durable : sans réseau, une app rechargée affiche de toute façon l'écran de connexion. Chaque vente de la file porte ces quatre champs (pas de nouvelle version de la base IndexedDB). Contexte inconnu : vente hors ligne refusée (« Reconnectez-vous en ligne avant de vendre hors ligne »), panier intact. Catalogue : une entrée par couple utilisateur-boutique, lue seulement pour le contexte en cours ; l'ancienne entrée sans marque est supprimée au premier chargement en ligne (donnée qui se retélécharge).
3. Serveur : `utilisateur_attendu` et `boutique_attendue`, facultatifs, en écriture seulement, sur `POST /api/ventes/`. Absents (ancienne version) : rien ne change. Différents de `request.user` ou de la boutique de la requête : 409 `{"detail": …, "code": "VENTE_AUTRE_COMPTE"}`, aucune écriture, contrôlé avant la recherche de la clé d'idempotence. Envoyés aussi pour une vente en ligne. Pas de colonne, pas de migration.
4. Synchronisation : seules les ventes de l'utilisateur et de la boutique en cours sont rejouées ; les autres restent en file, sans changer de statut, comptées à part dans le bandeau (« N ventes en attente du compte X (boutique) : connectez-vous avec ce compte pour les envoyer »). 409 alors que la marque locale correspondait : `ECHEC_AUTRE`, vente gardée.
5. Déconnexion volontaire (`Account.jsx`) : s'il reste des ventes non envoyées, confirmation (avec « Envoyer maintenant » si en ligne) ; puis effacement de tous les catalogues, de `boutique_active_id` et du contexte de session ; jamais de la file. Session expirée (`authFailureHandler`) : rien n'est effacé.
6. Ventes déjà en file sans marque : jamais envoyées automatiquement ni supprimées ; montrées à part (« Ventes à vérifier (créées avant la mise à jour) » : date, montant, produits) ; une seule action, ouverte à tout vendeur, après la confirmation explicite « Envoyer avec mon compte (nom) et ma boutique (nom) » : la vente reçoit la marque en cours, puis part ; le serveur garde tous ses contrôles. Même traitement pour une vente sans marque ajoutée par un ancien frontend encore ouvert.
7. Le test de constat devient un test de non-régression, inversé, vu échouer sur le code d'avant chaque correctif.

Décision : seule la page Ventes marche hors ligne (Mahamadou, 2026-10-16). Constat qui l'a motivée : une app rechargée hors ligne ne peut pas vendre du tout, contexte ou pas. Au démarrage, `bootstrapAuthentication` (`api.js`) appelle `token/refresh/` ; hors ligne, l'appel échoue, `isAuthenticated` reste faux et `App.jsx` affiche l'écran de connexion. Situation lue dans le code, pas reproduite ; elle date de `56829ac` (jeton de rafraîchissement dans un cookie HttpOnly, jeton d'accès en mémoire seulement). Décidé :
- Limite connue, acceptée pour l'instant : une app ouverte ou rechargée sans réseau affiche l'écran de connexion (lu dans le code, à confirmer sur un téléphone). Consigne aux clients : ouvrir l'app avec du réseau, puis laisser l'onglet ouvert ; les ventes faites ensuite hors ligne partent au retour du réseau.
- Mode « session hors ligne » : chantier possible, à faire seulement si des clients le demandent. Principe noté : entrer dans l'app sans jeton quand le rafraîchissement échoue faute de réseau (pas sur un refus du serveur) et qu'un contexte de session est enregistré durablement ; ventes seulement mises en file ; envoi au retour du réseau, après un vrai rafraîchissement (cookie encore valable, sinon `ECHEC_AUTH`, vente gardée).
- La condition de la réponse 3 (contexte durable et test du rechargement hors ligne) est retirée du plan actuel.

Découpage :
- Livraison A (backend, sans effet visible tant que le frontend n'envoie pas les champs) : 1. `feat(sales)` : `utilisateur_attendu`, `boutique_attendue`, 409 `VENTE_AUTRE_COMPTE`. 2. `feat(accounts)` : `boutique_id` dans `accounts/me/`.
  - Faite le 2026-10-16 : `ae4ea49` (6 tests, 5 contre-épreuves vues échouer) et `02ed419` (3 tests, 2 contre-épreuves) ; suite backend 667 OK. Poussée seule le 2026-10-16 (`14a7043..02ed419`), CI verte (run 38955608986, backend et frontend). Vérifiée en prod le 2026-10-16 par Mahamadou : Render sert `02ed419` (« Live ») ; une vente normale passe comme avant ; `accounts/me/` renvoie `"boutique_id": 4` avec `"boutique_nom": "Boutique 2"` (boutique de test), lu dans l'onglet Réseau du navigateur. Le 409 n'est pas vérifié en prod (aucun frontend n'envoie encore les champs) : couvert par les tests.
- Livraison B (frontend, après le déploiement de A) : 3. contexte de session (en mémoire), marque des ventes et du catalogue, vente hors ligne refusée sans contexte (partie « catalogue » du test inversé). 4. synchronisation limitée au compte en cours, bandeau « autre compte » et « à vérifier », envoi confirmé des ventes sans marque, 409 traité (partie « file »). 5. déconnexion : avertissement, effacement des catalogues, de `boutique_active_id` et du contexte (partie « déconnexion »). 6. `docs`.
  - Terminée et vérifiée en prod le 2026-10-19 (voir « Test en prod de la livraison B »). Faite le 2026-10-16 (commits 3 à 5, puis 6), poussée le 2026-10-19 avec le 5 bis (`02ed419..42e1117`), puis le 5 ter (`42e1117..75a48c9`). Pour chaque commit, les nouveaux tests ont été vus échouer sur le code d'avant (fichiers de `HEAD` remis le temps du test, puis restaurés, empreintes vérifiées), puis des contre-épreuves.
    - 3. `d5d8b94` : `contexteSession.js` ; chaque vente en file porte `utilisateur_id`, `utilisateur_nom`, `boutique_id`, `boutique_nom` (obligatoire) ; catalogue rangé par couple utilisateur-boutique (clé `utilisateur:boutique`), ancienne entrée sans marque supprimée ; `utilisateur_attendu` et `boutique_attendue` envoyés avec chaque vente, en ligne comme hors ligne ; hors ligne sans contexte : vente refusée (« Vente non enregistrée. Reconnectez-vous en ligne avant de vendre hors ligne. »), panier intact. Le catalogue frais est sauvegardé dès que le contexte arrive (les chargements de `accounts/me/` et du catalogue partent en parallèle). 12 tests, 12 échecs sur 17 sur le code d'avant, 7 contre-épreuves.
    - 4. `3a21241` : seules les ventes du même utilisateur et de la même boutique sont rejouées ; contexte inconnu : rien n'est envoyé ; `SettingsContext` recopie le contexte et relance la synchronisation à chaque chargement de `accounts/me/` (celle du démarrage, dans `main.jsx`, n'envoie donc plus rien). Bandeau : compte en cours ; autres comptes regroupés (« N ventes en attente du compte X (boutique) : connectez-vous avec ce compte pour les envoyer ») ; « N ventes à vérifier (créées avant la mise à jour) », repliable, avec date, montant payé enregistré et produits, et le bouton « Envoyer avec mon compte (nom) et ma boutique (nom) » suivi d'une confirmation. `marquerVente` refuse une vente déjà marquée (jamais réattribuée). 13 tests, 13 échecs sur 37 sur le code d'avant (le test du 409 passait déjà : non-régression), 10 contre-épreuves.
    - 4 bis. `46aca73` (demandé par Mahamadou le 2026-10-16) : vente faite en ligne et refusée en 409 `VENTE_AUTRE_COMPTE` : message dans la page « Cette vente correspond à une autre boutique ou un autre compte. Rechargez la page. » au lieu d'un `alert()`, panier gardé, jamais de mise en file ; tout autre 409 garde l'`alert()`. 2 tests (le premier échoue sur le code d'avant), 3 contre-épreuves. Vérifié seul (fichiers du commit 5 mis de côté par `git stash`) : 318 tests OK.
    - 5. `840ddc2` : `confirmerDeconnexion` (appelée par `App.handleLogout`) : en ligne, envoi tenté d'abord ; s'il reste des ventes, avertissement (« elles ne seront pas effacées et partiront à la prochaine connexion du compte qui les a faites ») ; `AuthContext.logout` efface tous les catalogues, `boutique_active_id` et le contexte, jamais la file ; session expirée : rien n'est effacé. 6 tests, échec sur l'`AuthContext` d'avant, 7 contre-épreuves. Non testé : le branchement dans `App.handleLogout` (relu).
    - 5 bis. `2bfd534`, fait le 2026-10-19, avant le push (décidé par Mahamadou le 2026-10-16 au soir) : déconnexion refusée sans réseau. Voir « Décision : déconnexion refusée sans réseau » ci-dessous.
  - Écarts avec le plan, acceptés par Mahamadou le 2026-10-16 : pas de bouton « Envoyer maintenant » dans l'avertissement (une boîte `confirm` n'a que Oui ou Non) : l'envoi est tenté automatiquement avant ; le bouton de déconnexion est dans `App.jsx` (en-tête et panneau de navigation), pas dans `Account.jsx`, qui déconnecte seulement après un changement de mot de passe (effacement appliqué, sans avertissement).
  - Frontend (2026-10-16, après le commit 5) : lint, 324 tests et build OK.
- Mode « session hors ligne » : hors de ce plan (chantier possible, si des clients le demandent).
- Relevé en préparant le test (2026-10-16, lu dans le code, pas reproduit) : une déconnexion faite hors ligne n'atteint pas le serveur (`token/logout/` échoue), donc le cookie de rafraîchissement de A reste valable. L'app affiche bien l'écran de connexion et efface catalogues, boutique active et contexte, mais si la page est rechargée avec du réseau avant qu'un autre compte se connecte, `bootstrapAuthentication` reconnecte A sans mot de passe. Décidé par Mahamadou : voir le point suivant.
- Décision : déconnexion refusée sans réseau (Mahamadou, 2026-10-16 au soir ; commit 5 bis le 2026-10-19, avant le push). Si l'appel `token/logout/` échoue (hors ligne ou erreur réseau), la déconnexion est refusée : message « Pas de connexion : impossible de vous déconnecter en sécurité. Réessayez quand le réseau revient. » ; rien n'est effacé (ni jeton d'accès, ni catalogues, ni `boutique_active_id`, ni contexte) et la session reste ouverte. Raison : B ne peut pas se connecter sans réseau, donc une déconnexion hors ligne n'apporte rien et laisse valable le cookie de rafraîchissement de A.
  - Lu dans le code avant le 5 bis : `api.logout` efface le jeton d'accès dans un `finally`, et `AuthContext.logout` efface tout et affiche l'écran de connexion dans un `finally`, donc même quand l'appel échoue. `ensureCsrfToken` est appelé avant `token/logout/` : son échec hors ligne compte aussi comme un échec.
  - Réponses de Mahamadou le 2026-10-19 : (a) refuser sur tout échec, sauf si le serveur indique clairement que le cookie est déjà invalide. Lu dans `LogoutView` (`accounts/views.py`) : elle répond 204 dans tous les cas de cookie (absent, expiré, invalide, déjà révoqué : déconnexion idempotente, `accounts/tests.py`, `test_logout_blackliste_efface_cookie_et_est_idempotent`) ; aucune réponse d'erreur ne signale donc un cookie déjà invalide, et toute erreur (403 CSRF, 5xx, absence de réponse) refuse la déconnexion. (b) hors ligne (`navigator.onLine` faux) : refus immédiat, sans l'avertissement des ventes ; l'échec de l'appel est contrôlé quand même ensuite. (c) message par `alert()`, comme l'avertissement.
  - 5 bis (`2bfd534`, 2026-10-19) : `api.logout` n'efface le jeton d'accès qu'après la réponse ; `AuthContext.logout` laisse remonter l'erreur sans rien effacer ; `confirmerDeconnexion` refuse tout de suite hors ligne ; nouvelle `deconnexionVolontaire` (`deconnexion.js`, appelée par `App.handleLogout`) : message par `alert()` si `token/logout/` échoue, et sortie de la vue support seulement après une déconnexion réussie (avant, elle avait lieu avant l'appel). Écart avec la décision, validé par Mahamadou le 2026-10-19 : après un changement de mot de passe (`Account.jsx`), la déconnexion reste faite même sans réponse (`logout({ cookieDejaRevoque: true })`), car le serveur a déjà révoqué le cookie (`accounts/tests.py`, `test_changement_mot_de_passe_revoque_access_et_refresh_mais_pas_autre_utilisateur`) ; sans cette option, le message « Erreur lors du changement de mot de passe » serait apparu alors que le mot de passe était changé. Tests : 4 nouveaux dans `isolationHorsLigne.test.js` (vrai `AuthContext`, vrai `api.js` : échec de `csrf/` sans réponse, erreur réseau et erreur 500 sur `token/logout/`, changement de mot de passe), tous en échec avec `api.js` et `AuthContext.jsx` de `HEAD` ; dans `deconnexion.test.js`, le test hors ligne inversé et 4 tests de `deconnexionVolontaire`. 6 contre-épreuves vues échouer (refus hors ligne retiré, vue support quittée avant, échec non rattrapé, option ignorée, jeton effacé dans un `finally`, effacement en cas d'échec), fichiers restaurés, empreintes vérifiées. Frontend : lint, 332 tests et build OK.
  - Limite connue, notée par Mahamadou le 2026-10-19 : sans réseau, la déconnexion est refusée, donc un collègue pourrait vendre sur la session encore ouverte (ses ventes porteraient le nom du compte resté connecté). Consigne aux vendeurs : se déconnecter avant de passer le téléphone.
  - Conséquence sur le test en prod : avec le réseau revenu, A est toujours connecté, donc sa vente part toute seule (`syncEngine` écoute l'événement `online`, et `confirmerDeconnexion` tente l'envoi avant). Le cas « vente en attente d'un autre compte » ne se produit donc plus par une déconnexion ; il n'est plus vérifiable en prod par ce chemin (couvert par les tests du commit 4).
- Diagnostic : déconnexion refusée sur iPhone Safari (test en prod du 2026-10-19, Mahamadou, journaux Render). Étape 7 du test : réseau revenu, la vente hors ligne est partie, mais la déconnexion restait refusée avec le message « Pas de connexion ». Sur iPhone Safari, `GET /api/csrf/` répond 200 puis `POST /api/token/logout/` répond 403 (trois fois : 10:59, 11:00, 11:04) ; sur PC Chrome, `POST /api/token/logout/` répond 204. Cause : `vercel.app` et `onrender.com` sont deux sites distincts (suffixes publics), donc les cookies de l'API sont des cookies tiers, et Safari les bloque : ni `csrftoken` ni le cookie de rafraîchissement ne sont gardés sur iPhone, il n'y a rien à révoquer. Le refus du 5 bis était donc faux dans ce cas, et la déconnexion était impossible sur iPhone Safari depuis le push de `42e1117` jusqu'au 5 ter. Avant le 5 bis, ce 403 était caché par le `finally` (déconnexion toujours faite sur l'appareil).
  - Conséquence lue dans le code, pas vérifiée sur l'iPhone : sans cookie de rafraîchissement, `token/refresh/` échoue aussi sur Safari ; recharger l'app renvoie à l'écran de connexion, et la session se termine à l'expiration du jeton d'accès (15 minutes).
  - Vraie solution : app et API sur le même domaine (cookies du même site). Chantier « nom de domaine », devenu prioritaire (voir « Prochaines étapes »).
  - 5 ter (`a908d6b`, 2026-10-19 ; règle de Mahamadou, affinée le même jour) : échec de `token/logout/` :
    - aucune réponse (hors ligne, erreur réseau) : refus, « Pas de connexion : impossible de vous déconnecter en sécurité. Réessayez quand le réseau revient. » ;
    - réponse 5xx (souvent Render qui sort de veille ; le cookie existe peut-être encore) : refus, « Le serveur ne répond pas correctement. Réessayez dans un instant. » ;
    - réponse 4xx, dont le 403 de Safari : déconnexion de l'appareil comme avant le 5 bis (rien à révoquer sur iPhone) : jeton d'accès, catalogues, boutique active et contexte effacés, file des ventes gardée.
    - Refus immédiat gardé quand `navigator.onLine` est faux ; après un changement de mot de passe, déconnexion dans tous les cas (inchangé).
    - Code : `AuthContext.logout` (refus sans réponse ou sur un 5xx), `deconnexionVolontaire` (choix du message selon le statut), commentaire de `api.logout`. Tests : 403 et 401 déconnectent (vrai `AuthContext`, vrai `api.js`), en échec avec l'`AuthContext.jsx` du 5 bis ; 500 refusé, rien d'effacé, en échec avec la première version du 5 ter (déconnexion dès qu'il y a une réponse) ; message du 5xx (`deconnexion.test.js`), en échec avec un seul message. 4 contre-épreuves vues échouer (code du 5 bis ; première version du 5 ter ; un seul message ; déconnexion sans réponse), fichiers restaurés, empreintes vérifiées. Frontend : lint, 335 tests et build OK.
  - Risque restant, noté par Mahamadou le 2026-10-19 : sur un navigateur où les cookies passent (PC Chrome), un 403 de `token/logout/` déconnecte l'appareil sans révoquer le cookie de rafraîchissement, et un rechargement avec du réseau reconnecterait le compte. Un tel 403 signalerait une configuration CSRF cassée (`CSRF_TRUSTED_ORIGINS`, cookie `csrftoken`), visible pour tous : le rafraîchissement de session (`token/refresh/`) passe par la même protection et échouerait aussi.

### Test en prod de la livraison B : terminé le 2026-10-19 (Mahamadou)

Résultats du 2026-10-19 (Mahamadou) : push `02ed419..42e1117` ; CI verte (run 39235062761, backend et frontend). Étapes 5 et 6 OK (vente en attente en mode avion ; déconnexion refusée avec le message, session gardée). Étape 7 : la vente est partie au retour du réseau, mais la déconnexion restait refusée sur iPhone Safari (voir « Diagnostic : déconnexion refusée sur iPhone Safari »).

Après le 5 ter : push `42e1117..75a48c9`, CI verte (run 39247076606, backend et frontend). La déconnexion marche sur iPhone Safari et sur PC. Preuves dans `GET /api/ventes/` : vente #53 (V-64CFD622), `horodatage_client` 10:11:50, `date_vente` 10:13:26, `creee_hors_ligne` true, `utilisateur_nom` admin ; vente #57 (V-8AD22EA7), faite hors ligne, `utilisateur_nom` dima (compte employé). Le scénario « vente de A en attente, puis connexion de B » n'est pas reproductible en prod (déconnexion refusée hors ligne) : couvert par les tests du commit 4. Livraison B terminée et vérifiée en prod.

Plan suivi (tel qu'écrit avant le test) :

Boutique de test (Boutique 2, id 4), jamais celle d'un client. Deux comptes de cette boutique, A et B (par exemple le propriétaire et un employé ; tout vendeur peut vendre). Un seul téléphone pour les étapes 3 à 9, avec le mode avion ; un ordinateur pour lire les réponses de l'API.

Avant le push :
1. Sur le téléphone, aucune vente en attente (pas de bandeau orange). Sinon, la laisser partir d'abord : avec le nouveau frontend, une vente restée en file sans marque passerait en « à vérifier ».

Push, puis :
2. CI verte pour le commit poussé (API publique de GitHub) ; Vercel sert ce commit. Livraison B = frontend seulement, Render inchangé (`02ed419`).
3. Sur le téléphone, avec du réseau : ouvrir l'app ; accepter « Une nouvelle version de IwiShop est disponible. Recharger maintenant pour l'installer ? » (sinon, fermer et rouvrir l'app).
4. Se connecter avec A, ouvrir la page Ventes (le catalogue hors ligne de A se remplit).
5. Mode avion, sans recharger : une vente avec A. Attendu : bandeau « 1 vente en attente de synchronisation. ». Noter l'heure et le montant.
6. Toujours en mode avion : se déconnecter. Attendu (commit 5 bis) : déconnexion refusée, « Pas de connexion : impossible de vous déconnecter en sécurité. Réessayez quand le réseau revient. » ; A reste connecté, page Ventes toujours utilisable (catalogue présent), bandeau « 1 vente en attente de synchronisation. » toujours là.
7. Couper le mode avion, sans recharger. Attendu : la vente part toute seule (bandeau disparu), puis se déconnecter : déconnexion acceptée, sans avertissement (plus aucune vente en file), écran de connexion. Recharger la page : écran de connexion, A n'est pas reconnecté (le cookie de A est invalidé par le serveur).
8. Se connecter avec B. Attendu : aucun bandeau ; la vente de l'étape 5 apparaît une seule fois dans l'historique des ventes de la boutique.
9. Déconnecter B (en ligne). Attendu : pas d'avertissement, écran de connexion.
10. Sur l'ordinateur, propriétaire connecté, outils de développement, onglet Réseau, page Historique des ventes : dans la réponse de `GET /api/ventes/`, la vente de l'étape 5 a `utilisateur_nom` = A (le vendeur n'est pas affiché dans l'écran).
11. Sentry (backend) : aucune erreur nouvelle. Une erreur dans la console du navigateur à l'étape 6 est attendue (l'appel `token/logout/` n'a pas joint le serveur) ; le frontend n'envoie rien à Sentry.

Facultatif :
- 409 d'une vente en ligne (4 bis), seulement si un propriétaire a deux boutiques : deux onglets sur la boutique X ; dans le second, passer sur la boutique Y ; dans le premier, sans recharger, vendre. Attendu : « Cette vente correspond à une autre boutique ou un autre compte. Rechargez la page. », panier gardé, aucune vente créée.

Pas dans ce plan, couverts par les tests : ventes « à vérifier » (il faudrait une vente restée en file avec l'ancien frontend), vente en attente d'un autre compte (bandeau « N ventes en attente du compte X » : avec le 5 bis, une déconnexion demande du réseau et la vente part avant ; tests du commit 4), session expirée (rien n'est effacé), déconnexion après un changement de mot de passe.

### Stockage des fichiers en développement (relevé le 2026-10-16)

- Constat : le `.env` local a `CLOUDFLARE_R2_BUCKET_NAME=iwishop-media`, le bucket de la prod (nom lu seul, aucune autre valeur affichée). Dès que les identifiants locaux marchent (le 403 du 2026-10-15 venait de l'horloge décalée, `RequestTimeTooSkewed`, constat de Mahamadou du 2026-10-19 : R2 refuse une requête mal datée), le développement écrit et supprime dans le bucket de la prod.
- Proposé : désactiver cette seule ligne du `.env` local (la commenter avec `#`). `settings.py` passe alors à `FileSystemStorage` : fichiers dans `media/` (ignoré par git), servis par Django sous `/media/` avec `DEBUG=True`. Aucun changement de code ; la prod garde ses variables sur Render. Vérification : `venv\Scripts\python manage.py shell -c "from django.core.files.storage import storages; s = storages['default']; print(type(s).__name__, getattr(s, 'location', ''))"` doit afficher `FileSystemStorage` et le dossier `media` (au 2026-10-16, après les commits : `S3Storage`, le `.env` n'était pas encore modifié ; puis, le même jour, `.env` modifié par Mahamadou : 0 ligne active pour le bucket et pour les trois autres clés R2, `FileSystemStorage` sur `C:\Users\User\Desktop\sorashop-project\media`, `DEBUG` vrai, `MEDIA_URL` `/media/`). Erreur corrigée le 2026-10-16 : avec `default_storage`, la commande affiche `DefaultStorage` (l'enveloppe de Django), jamais la vraie classe.
- Pas de surcharge par variable d'environnement : sous PowerShell, `$env:CLOUDFLARE_R2_BUCKET_NAME = ''` supprime la variable, et `python-decouple` relit alors la valeur du `.env`.
- Les trois autres clés R2 du `.env` local (accès, secret, adresse) ne servent plus une fois la ligne désactivée. Si elles sont valides, ce sont des droits d'écriture sur le bucket de la prod gardés sur le PC : à retirer du `.env` (ou, si un jour il faut tester R2 en local, un bucket et un jeton dédiés au développement).
- Fait le 2026-10-16 : `.env` local modifié par Mahamadou (bucket et trois clés R2 désactivés).

### Vérification à l'œil en local : faite le 2026-10-16 (Mahamadou)

Seulement avec le stockage local : la vérification ci-dessus doit afficher `FileSystemStorage`, sinon rien n'est lancé. Base de dev `sorashop_db`, jamais la prod.

Préparation (Claude, 2026-10-16) : aucun ancien serveur ouvert ; `FileSystemStorage` confirmé ; migration `products.0015` appliquée sur la base de dev (hôte `localhost`, port 5432, base `sorashop_db`, vérifiés juste après la migration ; aucun SQL). Backend sur `127.0.0.1:8001`, frontend sur `127.0.0.1:5173` (`npx vite --host 127.0.0.1 --port 5173`, `vite.config.js` inchangé, qui fixe 5174). CORS vérifié pour l'origine `http://127.0.0.1:5173` (avec cookies et prévol). Compte `admin`, propriétaire de « Ma Boutique » (boutique 1).

Constats de Mahamadou, tous OK :
- Photo affichée dans la liste et dans la fiche ; image par défaut pour les produits sans photo ; vue téléphone lisible.
- Changer puis retirer la photo met à jour `media/produits/`.
- Texte renommé `test.jpg` : refusé avec « Choisissez une photo JPG ou PNG ».

Fichier relu avec Pillow par Claude après la vérification : `media/produits/1/9cbe42e585bd425fb5f71df58965ba3a.webp`, 8,9 Ko, WEBP 800 x 800, RGB, 0 balise EXIF, ni XMP ni profil ICC ; c'est la photo du produit 39 (« Ampule », boutique 1), seul produit de la base de dev avec une photo. Taille de la photo d'origine non relevée : la réduction (côté le plus long ramené à 800 px) n'est donc pas prouvée sur ce fichier, seulement par les tests.

Pas dans ce compte rendu, donc non vérifiés à l'œil : création d'un produit avec photo (étape 7), hors ligne (étape 9), droits d'un employé (compte `Cisse`). Couverts par les tests.

Relevé en préparant (2026-10-16) :
- `CSRF_TRUSTED_ORIGINS` absent du `.env` local : le rafraîchissement de session (`POST /api/token/refresh/`) est refusé en local (403 « Origin checking failed »), depuis 5173 comme depuis 5174 ; la connexion marche, mais recharger la page renvoie à l'écran de connexion. Ligne proposée (sans secret) : `CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174`. Pas encore ajoutée.
- Vite écoute par défaut sur `localhost` en IPv6 seulement ; l'API est sur `127.0.0.1` : pour le navigateur, deux sites différents, et le cookie de session (`SameSite=Lax`) ne suit pas. En local, ouvrir le frontend sur `127.0.0.1`, pas `localhost`.
- 14 petits PNG (`photo*.png`, 0,1 Ko, datés du 2026-09-02 au 2026-09-06) à la racine de `media/produits/`, référencés par aucun produit : restes des anciens tests d'envoi, d'avant le stockage en mémoire des tests (`6ba8f22`). À supprimer à la main, si Mahamadou le décide.

Étapes prévues :

1. Migration : `venv\Scripts\python manage.py migrate products`, puis `showmigrations products` : `[X] 0015_photo_par_boutique`.
2. Backend : `venv\Scripts\python manage.py runserver 8001` (port de `VITE_API_URL`). Frontend : `npm run dev` dans `sorashop-frontend/`.
3. Liste des produits : image par défaut pour les produits sans photo.
4. Modifier un produit, choisir une grande photo de téléphone, aperçu, « Enregistrer » : miniature dans la liste. Sur le disque : `Get-ChildItem media\produits -Recurse -File | Select-Object FullName, Length` : un seul `.webp` dans `media\produits\<id de la boutique>\`, d'environ 30 à 80 Ko, sans le nom d'origine.
5. Changer la photo : toujours un seul fichier (l'ancien supprimé). Retirer la photo : image par défaut, plus aucun fichier.
6. Fichier refusé : un `.txt` renommé en `.jpg` (choisir « Tous les fichiers » dans la fenêtre de sélection) : message rouge dans la page, « Produit enregistré, photo non envoyée : Format d'image non accepté. Choisissez une photo JPG ou PNG. »
7. Créer un produit avec une photo : miniature dans la liste.
8. Largeur téléphone (375 px, outils de développement) : fiche lisible, boutons utilisables.
9. Hors ligne (outils de développement, Réseau, « Hors connexion ») : images par défaut sans recharger ; de retour en ligne, les miniatures reviennent.

### Test en prod de la livraison 1 : fait le 2026-10-16 (Mahamadou, boutique de test)

Photo de produit, livraison 1 : vérifiée en prod le 2026-10-16. Constats de Mahamadou :
- Capture du tableau de bord Cloudflare : objet `produits/4/8dd8947e0a8745ffb8c04efc4378fd43.webp` dans `iwishop-media`, type `image/webp`, 34,72 Ko, créé le 16 Oct 2026 à 18:29:45 UTC. Boutique 4 = boutique de test. Fichier rangé dans le dossier de la boutique, sous un nom aléatoire, en WebP. Image envoyée : une capture d'écran de téléphone, pas une photo d'appareil photo.
- Changement et retrait de la photo : vérifiés par Mahamadou, sans capture.
- Suppression du fichier dans le bucket : après « Retirer la photo » dans l'app, Cloudflare affiche « Failed to find Object » pour `produits/4/8dd8947e0a8745ffb8c04efc4378fd43.webp` (capture du 2026-10-16) : le fichier est bien supprimé par l'app.

Pas dans ce compte rendu, donc non vérifiés en prod :
- Sur un vrai iPhone (Safari) : choisir une photo de la galerie (HEIC) ; elle doit arriver en JPEG et être acceptée. Si elle est refusée, le message doit être « Format d'image non accepté. Choisissez une photo JPG ou PNG. »
- Une photo prise avec l'appareil photo (grande image avec métadonnées EXIF, dont l'orientation et la position GPS) : réduction à 800 px et retrait des métadonnées prouvés seulement par les tests.

### Vérifications en prod avant le commit 2 : faites le 2026-10-16 (Mahamadou, en lecture seule)

1. Base de prod, dans sa fenêtre PowerShell habituelle, requête en lecture seule (`BEGIN READ ONLY` puis `ROLLBACK`) : 5 produits, 0 avec photo. Rien à reprendre : « reprise des photos déjà en prod » retirée de la livraison 2.
2. Bucket médias : `CLOUDFLARE_R2_BUCKET_NAME` vaut `iwishop-media` sur Render ; dans Cloudflare, `iwishop-media` n'a aucun domaine personnalisé, son adresse publique de développement (`r2.dev`) est désactivée, et il est distinct d'`iwishop-backups`. D4 confirmée.
3. En plus : un logo envoyé en prod le 2026-10-15 à 21:39 est présent dans `iwishop-media/logos/`. Les identifiants R2 de la prod marchent donc ; le refus 403 ne concernait que le `.env` local, et il est expliqué : horloge du PC décalée (`RequestTimeTooSkewed`, constat de Mahamadou du 2026-10-19). Le développement utilise maintenant le stockage local.

## Terminé le 2026-10-15 : facture (phase 1)

Phase 1 terminée et vérifiée en prod le 2026-10-15 (livraisons 1 et 2).

Plan validé par Mahamadou le 2026-10-15, livré en deux temps. Livraison 1 (commits 1 à 5, avec 2 bis, 3 bis, 3 ter et 4 bis) faite le 2026-10-15 et vérifiée en local par Mahamadou : écran, vue téléphone (375 px), deux PDF d'exemple (vente normale, vente à crédit annulée). Poussée le 2026-10-15 (`4c7734e`, CI verte, backend et frontend), puis vérifiée en prod par Mahamadou le même jour sur une boutique de test : livraison 1 terminée (voir « Test en prod de la livraison 1 »). Livraison 2 (commit 6) poussée le 2026-10-15 (`2fc3b74`, CI verte, backend et frontend, run 38819444966), puis vérifiée en prod le même jour (voir « Livraison 2 »).

### Décisions (Mahamadou, 2026-10-15)

1. Numéro `F-AAAA-NNNN`, une suite par boutique et par année (repart à 1 au 1er janvier, fuseau `Africa/Bamako`), sans trou ni doublon : verrou sur la vente puis sur la boutique (NO KEY UPDATE, qui ne bloque pas les clés étrangères des autres écritures de la boutique). Pas d'interblocage : partout, l'ordre est vente, produits, boutique.
2. Facture émise à la demande seulement : bouton dans l'historique des ventes (livraison 1), case « Facture » à la vente (livraison 2).
3. Facture annulée si et seulement si sa vente l'est (déduit, jamais saisi). Le numéro est gardé, jamais réutilisé ; tampon « ANNULÉE » sur le PDF.
4. Tout vendeur peut émettre (propriétaire et employés) ; l'annulation de la vente reste au propriétaire.
5. Contenu : lignes, total, remise, net, mode de paiement ; vente à crédit : « Vente à crédit, acompte versé à la vente : X » (l'acompte ne change plus après la vente). Jamais de reste dû ni de remboursements : même numéro, même document (un « remboursement » dans iWiShop est le remboursement d'une dette par le client). Pas de NIF, RCCM ni TVA.
6. Pas de lien public vers le PDF.

Précisions :
- Copie figée à l'émission : coordonnées de la boutique (`Boutique.nom`, comme les exports des rapports), client, lignes (noms du produit et de l'unité), devise, logo par son chemin dans le stockage. La même facture donne toujours le même fichier PDF, au tampon près. Règle : ne jamais supprimer un ancien logo utilisé par une facture.
- Vente hors ligne : numéro attribué à la synchronisation (`demander_facture` à la création, même transaction que la vente ; backend livré par le commit 2, frontend en livraison 2).
- Route du PDF : `GET /api/ventes/factures/{id}/pdf/` (lecture : permise abonnement expiré, pour un employé et en Vue Support ; autre boutique : même 404 qu'une facture inexistante).

### Livraison 1 (commits du 2026-10-15)

1. `5434e72` `feat(sales)` : modèle `Facture` et `emettre_facture`. 11 tests, dont 3 de concurrence sur PostgreSQL, vus échouer sans le verrou de la boutique (numéro en double) et sans celui de la vente (facture sur vente annulée).
2. `73c1097` `feat(sales)` : API (`POST ventes/{id}/facture/`, champ `facture`, `demander_facture`). 12 tests ; vente annulée : 400 (500 avec la `ValidationError` de Django, vu échouer).
   - 2 bis. `46ddbe5` : lignes et devise figées (migration 0022 avec `db_default` ; INSERT SQL brut du code de 0021 accepté, `NotNullViolation` sans `db_default`, vu échouer).
3. `040a1c2` `feat(sales)` : PDF A4 (reportlab). Séparateur des milliers en espace insécable (U+202F absent d'Helvetica). Logo illisible : PDF sans logo, journalisé en ERROR (événement Sentry).
   - 3 bis. `53487d1` `fix(reports)` : export PDF des rapports avec un logo. Avant : `TypeError` (`Image` recevait un `ImageReader`), donc erreur 500 pour toute boutique avec un logo.
   - 3 ter. `6ba8f22` `test` : stockage des fichiers en mémoire pendant les tests (`TESTING`), jamais le vrai R2.
4. `52eae9c` `feat(frontend)` : historique des ventes, créer et télécharger la facture.
   - 4 bis. `daff0e6` `fix(frontend)` : sur téléphone, boutons en icône seule (`aria-label` et `title` gardés), numéro sans coupure.
5. `95891f3` `feat(frontend)` : partage (fichier PDF via le partage du téléphone, sinon PDF téléchargé et lien `wa.me`).

Suites complètes en local : backend 630 tests OK ; frontend 271 tests OK, lint et build OK. Chaque correctif a son test vu échouer avant.

### Test en prod de la livraison 1 : fait le 2026-10-15 (Mahamadou)

Sur une boutique de test, jamais celle d'un client (un numéro de facture ne se supprime pas). Constats de Mahamadou, tous OK :
- CI verte pour `4c7734e` (run 38810033222, backend et frontend, lu sur l'API publique de GitHub).
- Migrations `sales` 0021 et 0022 appliquées par `build.sh`.
- Facture créée depuis l'historique, téléchargée ; vente annulée : tampon « ANNULÉE » sur le PDF.
- Logo en prod (R2) : présent dans le PDF de la facture et dans les exports PDF des rapports (corrigés par le 3 bis).
- Vrai partage WhatsApp sur Android : OK.
- Sentry : aucune erreur nouvelle.

Pas dans ce compte rendu, donc non vérifiés en prod : Vue Support (PDF téléchargeable, création refusée ; couverts par les tests) et partage sur iPhone (Safari).

### Livraison 2

6. `4cb0d1f` `feat(frontend)` : case « Facture » à la vente (décochée par défaut, désactivée en Vue Support). Cochée : `demander_facture` envoyé ; en ligne, numéro affiché avec « Télécharger » et « Partager » ; champ `facture` absent (backend pas déployé) : avertissement vers l'historique. Hors ligne : la demande part dans la file IndexedDB avec la vente, message « Numéro de facture attribué à la synchronisation ». Le moteur de synchronisation renvoie déjà le payload tel quel (inchangé). 6 tests, vus échouer sans le flag, sans l'avertissement, sans le message hors ligne et sans la remise à zéro de la case. Frontend : lint, 277 tests et build OK.

Limite connue : une vente hors ligne envoyée une première fois à un ancien backend reste sans facture au second envoi (rejeu sans écriture) ; la créer depuis l'historique.

Test en prod de la livraison 2 : fait le 2026-10-15 par Mahamadou sur la boutique de test (Boutique 2), captures à l'appui. Constats, tous OK :
- Case « Facture » visible sous « Vente à crédit ».
- Vente hors ligne (mode avion), case cochée : message « Numéro de facture attribué à la synchronisation » et bandeau « 1 vente en attente » ; après le retour de la connexion, la vente #45 apparaît dans l'historique avec F-2026-0006.
- Dans l'historique : F-2026-0005 sur la vente #42.

Pas dans ce compte rendu, donc non vérifiés en prod : vente en ligne avec la case (numéro, « Télécharger » et « Partager » sur l'écran de vente) et vente sans la case (aucune facture) ; couverts par les tests.

### Hors phase 1

- Avoir (phase 2). Il demande d'abord le retour partiel ou le remboursement au client, qui n'existent pas aujourd'hui (seulement l'annulation complète).
- Annuler une facture seule et la réémettre.
- Numéro du client prérempli dans WhatsApp (les téléphones sont enregistrés sans indicatif pays, que `wa.me` exige).
- Lien public signé vers le PDF.
- Export de la liste des factures.

### Base de dev locale `sorashop_db` (2026-10-15)

- 7 migrations appliquées : `purchases` 0015 à 0019 et `sales` 0021 et 0022 (`showmigrations` n'en montre plus aucune en attente).
- Ventes « Démo facture » créées par l'API, compte `admin`, boutique 1 : #101 sans facture (puis F-2026-0003 créée à l'écran par Mahamadou), #103 (F-2026-0001), #104 (F-2026-0002, vente annulée). Deux entrées de stock « Démo facture » de 10 (MAO et Timini). La vente #102 n'existe pas (tentative refusée pour stock insuffisant, numéro consommé).

## Chantier : sauvegarde de la base

Décidé le 2026-10-13, après l'incident. Le commit 5+6 est passé d'abord (terminé le 2026-10-13).

Plan validé par Mahamadou le 2026-10-13. Étape B (vrai test de restauration en local) réussie le 2026-10-14, voir « Résultat de l'étape B ». Plan de l'étape C validé le 2026-10-15, voir « Étape C : plan validé ». Commits 1 à 3 de l'étape C (scripts) faits le 2026-10-15, avec un 3 bis (`.gitignore`), poussés le 2026-10-15 (`866bbc7`). Préalables P1 à P4 faits le 2026-10-15. Commit 4 mis en pause le 2026-10-15 au profit de la facture (phase 1). Reprise après la photo de produit et le site public (voir « Prochaines étapes ») : le commit 4 (2FA Cloudflare fait le 2026-10-19).

### Constat (2026-10-13)

- Render (doc « PostgreSQL backups ») : toute base payante a la restauration à un instant passé (PITR), sur 3 jours (espace Hobby) ou 7 jours (Pro ou plus) ; elle crée une **nouvelle** base, l'ancienne reste (il faut rebrancher les services). Pas de remplissage du passé : la fenêtre part du 2026-10-13. Sauvegardes « logiques » : **à déclencher à la main** (page Recovery), gardées 7 jours, téléchargeables. Aucune sauvegarde quotidienne automatique décrite. Non couvert : une erreur vue après la fenêtre, un problème de compte Render (toutes les copies chez Render). Ce que deviennent les sauvegardes si la base est supprimée : non dit, à vérifier.
- Versions : PostgreSQL 18.6 sur Render (vu avec `psql` par Mahamadou le 2026-10-05), client local 18.4 (`pg_dump --version`, 2026-10-13) : même version majeure.
- `scripts/backup_postgres.ps1` (`705bdf3`, doc `docs/postgresql-backup-restore.md`) : `pg_dump` au format custom de `DATABASE_URL` dans `backups/` (en fait, seuls `*.dump` et `*.sql` y étaient ignorés par git, relevé le 2026-10-15 ; dossier entier ignoré depuis `dbc5396`), vérifie que l'archive n'est pas vide et qu'elle se lit avec `pg_restore --list` (structure seulement, pas une restauration).
- `scripts/restore_postgres_temp.ps1` : `pg_restore` dans `TEMP_DATABASE_URL`, seulement si le nom de la base commence par `iwishop_restore_test_` et avec `-ConfirmTemporaryRestore` ; refuse une cible identique à `DATABASE_URL` (hôte, port, base) ; ne crée ni ne supprime de base.
- `backups/` : 15 archives, la plus récente du 2026-09-22, plusieurs de 0 octet (sauvegardes ratées laissées sur place). Aucune trace d'une restauration complète réussie : selon la doc des scripts, aucune archive n'est donc validée. Elles contiennent les données de toutes les boutiques (noms et téléphones des clients), non chiffrées, sur le PC. Les fichiers de R2 ne sont pas dans ces sauvegardes.

### Décisions (Mahamadou, 2026-10-13)

1. Une sauvegarde par jour.
2. Conservation : 30 quotidiennes et 12 mensuelles.
3. Stockage dans R2 privé, archive chiffrée. Pas de GitHub Actions (dépôt public).
4. On commence par l'étape B, avant toute automatisation.

### Étapes

- A. Constat dans le tableau de bord Render (Mahamadou) : plan de l'espace de travail (Hobby ou Pro), fenêtre de PITR, page Recovery d'`iwishop-db`.
- B. Premier vrai test de restauration, en local, jamais sur la prod :
  1. Archive fraîche de la prod avec `backup_postgres.ps1` (URL externe définie seulement dans la session PowerShell, jamais affichée).
  2. Base locale neuve `iwishop_restore_test_20261014`, après avoir vérifié qu'elle n'existe pas.
  3. `restore_postgres_temp.ps1` ; en cas d'échec, s'arrêter et lire l'erreur.
  4. Contrôles : `manage.py check` et `showmigrations` sur la base de test (sans `migrate`) ; comptage des lignes de chaque table, base restaurée et prod (lecture seule, `SELECT count(*)`), au même moment : comptes égaux ; V-2F621063 et V-AD91351B présentes.
  5. Résultat noté ici, puis suppression manuelle de la base de test, après relecture de l'hôte et du nom.
  - Plus tard, à décider à part : un test du PITR de Render (nouvelle base payante le temps du test, services jamais rebranchés).
- C. Régularité : tâche planifiée (« cron job ») chez Render : `pg_dump`, archive chiffrée, dépôt dans R2 privé, conservation selon la décision 2 ; coût mensuel à vérifier. Plus un test de restauration chaque mois.
- D. Preuve : journal daté de chaque sauvegarde, de chaque test de restauration et des comptes obtenus.

### Résultat de l'étape B (2026-10-14)

Fait le soir du 2026-10-14 par Mahamadou, dans sa propre fenêtre PowerShell. Horloge du PC vérifiée avant de commencer (`Get-Date` : 2026-10-14). Adresses de la prod et de la base de test saisies avec `Read-Host -AsSecureString` : jamais affichées, ni dans la conversation ni dans l'historique de PowerShell.

- Requête de comptage, en lecture seule (`SET default_transaction_read_only = on`, `BEGIN READ ONLY`, `ROLLBACK`) : nombre de lignes de chaque table du schéma `public`, dernière valeur de chaque séquence, nombre de tables, séquences, index et contraintes, présence des deux ventes témoins.
- Comptage de la prod avant la sauvegarde : 37 tables, 35 séquences, 120 index, 331 contraintes ; 35 ventes, 126 lignes dans `django_migrations` ; V-2F621063 et V-AD91351B présentes.
- Archive `iwishop_postgres_20261014_210926.dump` (208 202 octets), vérifiée par `backup_postgres.ps1` (non vide, `pg_restore --list`).
- Second comptage de la prod juste après : identique au premier (`Compare-Object` vide). L'archive correspond donc à cet état.
- Base locale neuve `iwishop_restore_test_20261014` (absence vérifiée avant `createdb`). Restauration par `restore_postgres_temp.ps1` sans erreur (`--exit-on-error`), `DATABASE_URL` laissée sur la prod pour que le garde-fou du script compare les cibles.
- Comptage de la base restaurée : identique à la prod, ligne pour ligne (comptes, séquences, objets, ventes témoins).
- Fenêtre basculée sur la base de test (hôte `localhost` relu avant), sans `migrate` : `manage.py check` sans problème ; `showmigrations` : 126 migrations appliquées, aucune non appliquée.
- Conclusion : une restauration complète marche. `iwishop_postgres_20261014_210926.dump` est la première archive validée ; les archives plus anciennes de `backups/` ne le sont toujours pas.
- Limites : seuls les nombres de lignes sont comparés, pas le contenu ; l'application n'a pas tourné sur la base restaurée (seulement `check` et `showmigrations`) ; restauration avec PostgreSQL 18.4 en local, pour une prod en 18.6 ; fichiers de R2 hors sauvegarde.
- Base de test supprimée le 2026-10-14 par Mahamadou : hôte, port et nom relus avant (`localhost`, 5432, `iwishop_restore_test_20261014`), `dropdb -i` confirmé, puis absence vérifiée (0 base de ce nom). Fenêtre PowerShell fermée ensuite (adresses effacées avec elle).

### Étape C : plan validé (2026-10-15)

Plan validé par Mahamadou le 2026-10-15, avec les décisions ci-dessous. Commits 1 à 3 (scripts) faits le 2026-10-15, voir sous chacun ; ensuite les préalables P1 à P4, puis le commit 4.

Constats (doc de Render, Cloudflare et Healthchecks.io, lue le 2026-10-15) :
- Une tâche planifiée Render peut joindre la base par son adresse interne (même région, même espace de travail). Facturée à la seconde (Starter : 0,00016 $/min), minimum 1 $ par mois et par tâche. Arrêtée au bout de 12 h. Exécution possible à la main (« Trigger Run »).
- Render envoie un e-mail quand une exécution de tâche planifiée échoue (réglage « Only failure notifications »).
- R2 : règles de cycle de vie par préfixe (suppression dans les 24 h après l'échéance) ; verrous de bucket par préfixe, prioritaires sur le cycle de vie, qu'on peut retirer depuis le tableau de bord ; offre gratuite de 10 Go par mois pour tout le compte (médias compris), sortie gratuite.
- Healthchecks.io : plan gratuit de 20 contrôles.
- À vérifier : construction d'une tâche planifiée depuis le Dockerfile du dépôt ; minutes de construction comprises dans l'espace Render ; e-mails sur le plan gratuit de Healthchecks.io.

Décisions (Mahamadou, 2026-10-15) :
1. Tâche planifiée Render, image Docker `postgres:18`, adresse interne de la base. Pas GitHub Actions : journaux publics (un message d'erreur peut contenir l'hôte), base à ouvrir à Internet, risque de configuration des workflows, tâches planifiées désactivées après 60 jours sans activité. Pas le PC : pas toujours allumé, horloge déjà décalée deux fois, adresse de la prod en permanence dessus.
2. Chiffrement avec `age`. Seule la clé publique va sur Render. Une seule clé privée, jamais sur Render, ni dans le dépôt, ni dans la conversation, gardée en deux exemplaires à deux endroits différents, hors du PC. Archive en clair seulement sur le disque temporaire du conteneur (pour `pg_restore --list`), jamais envoyée. Clé privée perdue : toutes les archives chiffrées avec elle sont illisibles, définitivement ; restent la prod et la restauration à un instant passé de Render (3 jours) ; nouvelle paire de clés, sauvegarde lancée à la main. Le test de restauration mensuel, qui déchiffre, détecte une perte en un mois au plus. Clé privée qui fuit : nouvelle paire de clés.
3. Alertes : e-mail de Render (exécution en échec ; le script s'arrête avec un code d'erreur à la moindre étape ratée) et Healthchecks.io (alarme « aucune nouvelle » : alerte si aucun signal de réussite en 24 h plus 2 h de marge ; seul moyen de savoir que la tâche n'a pas tourné du tout, comme lors de l'incident du 2026-10-10 ; signal d'échec aussi, pour une alerte immédiate).
4. R2 : bucket dédié, séparé des médias, sans accès public ni adresse `r2.dev`, jeton dédié « Object Read & Write » limité à ce bucket. `daily/AAAA-MM-JJ.dump.age` supprimé après 30 jours, `monthly/AAAA-MM.dump.age` (première sauvegarde réussie du mois, copiée seulement si elle est absente) supprimé après 365 jours, par des règles de cycle de vie (pas de suppression dans notre code). Verrou du bucket sur les mêmes délais : oui.
5. Fichier de comptes chiffré à côté de chaque archive : oui, en dernier (commit 6).
6. Archive invalide (`pg_dump` en échec, fichier vide, `pg_restore --list` en échec) : supprimée.
7. Heure : 03:00 UTC.
8. Utilisateur PostgreSQL en lecture seule pour la sauvegarde : plus tard, chantier séparé (modification de la prod).

Coût estimé : environ 1 $ par mois (minimum de la tâche Render) ; R2 et Healthchecks.io gratuits à ce volume (environ 42 archives de 0,2 Mo).

Préalables (Mahamadou, dans les tableaux de bord, sans code ; valeurs secrètes seulement dans les variables de la tâche Render) :
- P1. Cloudflare : bucket, deux règles de cycle de vie, verrous, jeton dédié.
  - Fait par Mahamadou le 2026-10-15 : bucket `iwishop-backups`, 2 règles de cycle de vie et 2 verrous conformes à la décision 4, accès public désactivé. Jeton R2 à créer seulement au moment de la tâche Render.
- P2. Paire de clés `age` (`age-keygen` sur le PC), clé privée rangée en deux exemplaires.
  - Fait par Mahamadou le 2026-10-15 : `age-keygen` (v1.3.2, windows-amd64, dans `C:\Tools\age`) lancé sur le PC avec `-o` vers la clé USB (`E:`) : clé privée écrite directement sur `E:` par `-o`, aucun fichier sur le disque du PC. Affichée une fois à l'écran pour la copie papier (`Select-String`, ligne `AGE-SECRET-KEY` seule), puis `Clear-Host`. Aller-retour prouvé : texte chiffré avec la clé publique (`age-keygen -y`), déchiffré avec la clé privée de la clé USB ; fichier de test supprimé. Deux exemplaires, clé USB et papier, à deux endroits.
- P3. Healthchecks.io : contrôle « iwishop-sauvegarde », période d'un jour, marge de 2 h, alerte par e-mail.
  - Fait par Mahamadou le 2026-10-15 : contrôle « iwishop-sauvegarde » créé, période 1 jour, marge 2 h (vérifié sur capture), alerte par e-mail ; contrôle d'exemple supprimé. L'URL de ping n'est notée nulle part : elle ira seulement dans les variables de la tâche Render.
- P4. Render : notifications d'échec par e-mail activées.
  - Fait par Mahamadou le 2026-10-15 : le réglage par défaut de l'espace de travail Render est « Only failure notifications » (vérifié sur la page Notifications du service iwishop, qui utilise ce défaut). La future tâche planifiée devrait en hériter : à vérifier sur sa page Notifications une fois créée.
- Double authentification (2FA) Cloudflare : obligatoire avant la création du jeton R2 (décidé par Mahamadou le 2026-10-15), donc avant la création de la tâche planifiée et sa mise en service.
  - Fait par Mahamadou le 2026-10-19 : nouveau mot de passe fort, 2FA par application activé et testé (code demandé, même avec la connexion Google), codes de secours sur papier. Gmail aussi en 2FA par application.

Commits prévus (chacun vérifiable) :
1. `fix(scripts)` : accents des deux scripts PowerShell (UTF-8 avec BOM). Preuves : `EF BB BF` en tête (`Format-Hex`), `git show` ne montre que ce changement, message lisible sous PowerShell 5.1 en lançant chaque script sans sa variable (vu abîmé avant).
   - Fait : `820bebb` (2026-10-15). Écart avec le plan : le BOM seul cassait les deux scripts (« Jeton inattendu ») : avec lui, PowerShell lit bien l'apostrophe typographique ’, mais la prend pour un guillemet simple, qui coupait les chaînes `'n’a…'`. Sans BOM, elle était lue comme `â€™` et le script marchait par accident. Les 11 chaînes concernées passent entre guillemets doubles, texte inchangé. Preuves : `EF BB BF` en tête, 0 erreur d'analyse (PowerShell 5.1, fichier entier), les 19 messages de `throw` lisibles, message lisible en lançant chaque script sans sa variable (abîmé avant).
2. `fix(scripts)` : `backup_postgres.ps1` supprime l'archive quand `pg_dump` échoue, quand elle est vide ou quand `pg_restore --list` échoue (décision 6). Preuve, en local seulement : adresse vers une base locale inexistante, nombre de fichiers de `backups/` compté avant et après ; un fichier de 0 octet apparaît sans le correctif, le compte ne bouge pas avec. Hors commit : suppression à la main des 5 archives de 0 octet, après les avoir listées.
   - Fait : `3659f5d` (2026-10-15), par un `try`/`finally`, avec un avertissement à chaque suppression. Banc d'essai hors dépôt, dans un dossier vide, fichiers comptés, aucune base touchée (vrai `pg_dump` vers le port 1 de la machine, ou faux `pg_dump` en PowerShell) : connexion refusée (0 o), archive vide (0 o), archive illisible (25 o) laissaient 1 fichier avant, 0 après ; aucun fichier produit : 0 avant et après ; archive valide (copie de celle du 2026-10-14) : 1 fichier gardé. Contre-épreuve sans `$archiveValide = $true` : archive valide supprimée, détectée. Ctrl+C non testé. Les 5 archives de 0 octet, listées avant, ont été supprimées à la main le 2026-10-15, chacune par son nom exact et seulement si elle faisait encore 0 octet ; il reste 12 fichiers dans `backups/`, dont `iwishop_postgres_20261014_210926.dump`.
3. `feat(scripts)` : `scripts/comptage_restauration.sql` (requête de l'étape B) et procédure dans `docs/postgresql-backup-restore.md`. Preuve : même format qu'à l'étape B sur la base locale.
   - Fait : `63c37ab` (2026-10-15). Corps de la requête identique à celui de l'étape B, en-tête seul ajouté. Exception exacte `!scripts/comptage_restauration.sql` dans `.gitignore` (décidée par Mahamadou), `*.sql` reste ignoré partout ailleurs (vérifié avec `git check-ignore`). Requête lancée par Mahamadou sur la base de dev `sorashop_db` : code de sortie 0, 74 lignes au format `cle;valeur`, mêmes clés que la prod du 2026-10-14 sauf `purchases_paiementfournisseur` et sa séquence (migration `purchases/0017` absente de la base de dev) et les deux ventes témoins (prod seulement). La procédure de la doc n'a pas encore servi en entier : premier passage complet au test de restauration du commit 4.
   - 3 bis. `dbc5396` (2026-10-15) : `fix(gitignore)`, dossier `/backups/` ignoré en entier. Seuls `*.dump` et `*.sql` l'étaient : le fichier de comptage de la base de dev apparaissait comme non suivi. Vérifié avec `git check-ignore` ; aucun fichier de `backups/` n'était suivi.
4. `feat(ops)` : sauvegarde quotidienne (Dockerfile `postgres:18`, script bash en `set -euo pipefail`) : `pg_dump` dans un fichier temporaire, `pg_restore --list`, chiffrement, envoi dans `daily/`, taille de l'objet vérifiée dans R2, signal à Healthchecks.io (réussite ou échec). Sans effet tant que la tâche n'est pas créée sur Render. Preuves : exécution à la main, objet présent ; objet téléchargé, déchiffré avec la clé privée et restauré en local avec la procédure de l'étape B ; avec un jeton R2 faussé exprès, exécution en échec, les deux e-mails reçus, aucun objet partiel (objets comptés) ; deux matins de suite, les quotidiennes présentes sans intervention.
5. `feat(ops)` : copie mensuelle. Preuves : `monthly/AAAA-MM` créé à la première exécution, toujours 1 objet dans `monthly/` à la suivante ; échéance de suppression affichée sur un objet (cycle de vie) ; suppression refusée depuis le tableau de bord (verrou).
6. `feat(ops)` : fichier de comptes chiffré, comptage juste avant et juste après `pg_dump`, gardé seulement si les deux sont égaux, sinon marqué « non comparable » sans faire échouer la sauvegarde. Preuve : après une restauration, `Compare-Object` avec ce fichier n'affiche rien.
7. `docs` : procédure complète (récupérer, déchiffrer et restaurer depuis R2 ; perte ou fuite de clé ; réponse à une alerte ; test mensuel).
8. `docs` : `EN_COURS.md`.

### Points à traiter

- Étape B réussie : décider quoi faire des archives non chiffrées de `backups/`, la nouvelle comprise (données de clients sur le PC), une fois la chaîne de l'étape C prouvée.
- Deux autres bases locales vues à la relecture du 2026-10-14, laissées intactes : `iwishop_restore_test_20260911` et `iwishop_restore_test_current_20260911` (anciens essais probables du 2026-09-11). Vérifier ce qu'elles contiennent, puis décider de les supprimer (copies de données de clients sur le PC).

## Fait récemment

- Correction des remboursements (corrections chaînées à l'original).
- Journal de caisse : v1 (lecture seule), correctif des libellés, impression.
- CI verte avec Vitest lancé à chaque push.
- Hook de secrets élargi (clés préfixées : `R2_*`, `PAYDUNYA_*`, `*_API_KEY`, `*_TOKEN`...).
- Test instable `Clients.test.jsx` réglé (`ebed005`, `504be15`).
- `CLAUDE.md` (règles permanentes) et ce fichier créés.
- Hook de secrets : backticks retirés de la docstring (lancé par erreur avec `sh`, ils exécutaient `git commit --no-verify`). Toujours lancer le hook avec Python.
- D1 tranchée : offre unique (`d6dc1f9`).
- `CLAUDE.md` : section Migrations (la base accepte l'ancien et le nouveau code pendant un déploiement, `db_default`, test en SQL brut) (`298086f`).

## Terminé le 2026-10-04 : dettes fournisseurs (achats à crédit)

Plan validé le 2026-10-02. Chantier terminé le 2026-10-04 : tous les commits sont poussés, CI verte, vérifiés en prod par Mahamadou.

Horloge du PC décalée jusqu'au 2026-10-04 : les dates git du 7 bis au 8 ter, et les dates 2026-10-03 notées pendant cette période, peuvent être fausses ; les dates de vérification en prod font foi.

- Commit 1 (expand) : `708acdf`, vérifié en prod par Mahamadou (Live, migrations 0015 et 0016, achat normal, caisse).
- Commits 2 et 3 : `3c761a1`, vérifiés en prod par Mahamadou (Live, migration 0017, test en prod).
- Commit 1 bis (contract) : `24ed0e8` (migrations 0018 re-backfill et 0019 NOT NULL), vérifié en prod par Mahamadou (0018 et 0019, achat normal, caisse).
- Commit 4 : `9131791` (`formater_montant`) et `e8e71fd` (API des paiements), poussés (`515153b`), CI verte.
- Commit 5 : `16e3f4d`, poussé (`0fc48d1`), CI verte. Render Live vérifié par Mahamadou (ce déploiement inclut aussi le commit 4).
- Commit 6 : `7cd88cc`, poussé (`29e03bd`), CI verte. Vérifié en prod par Mahamadou : Render Live, caisse du 01/10 identique à avant.
- Commit 7 : `2e25e34`, poussé (`f72d73b`), CI verte. Vérifié en prod par Mahamadou le 2026-10-03 : achat à crédit de 1000 avec 300 versés en espèces, reste dû de 700 FCFA affiché après l'enregistrement, badge sous le fournisseur, 300 dans les sorties de la caisse du jour.
- Commit 7 bis : `38e2584`, poussé (`cb5d253`), CI verte, vérifié en prod par Mahamadou. lint, build et 164 tests Vitest OK en local, 5 mutations détectées, captures à 375 px et en desktop.
- Petit chantier « bouton flottant » (priorité, avant le commit 9) : correctif `ed7c70c`, poussé (`cb5d253`), CI verte, voir plus bas.
- Commit 9 : `486155c`, poussé (`6873bc7`), CI verte, vérifié en prod par Mahamadou. Plan et décisions ci-dessous (2026-10-03). lint et build OK ; 27 tests de `JournalCaisse.test.jsx` OK ; 8 mutations détectées ; captures à 375 px, en desktop et à l'impression.
- Commit 8 : `0abc2a4`, poussé (`ed764df`), CI verte, vérifié en prod par Mahamadou. Plan et décisions ci-dessous (2026-10-03). lint et build OK ; 185 tests Vitest OK (dont 12 dans `SuppliersDettes.test.jsx`) ; 10 mutations détectées ; captures à 375 px et en desktop.
- Correctif z-index d'Iwi (priorité, avant le 8 bis) : `6dd69a4`, poussé (`0036395`), CI verte. Bouton d'Iwi en `z-40` (couche des éléments flottants), les fenêtres en `z-50` le recouvrent. Mesure Playwright (`elementFromPoint` au centre du bouton), à 375 px et en desktop : fiche fournisseur, ajout de fournisseur, fiche client, ajout de client : Iwi au-dessus avant le correctif (8 échecs), recouvert après ; sans fenêtre, Iwi reste visible et cliquable. Panneau « Plus » (375 px) : déjà au-dessus d'Iwi avant, inchangé. Autres fenêtres (Produits, Catégories, Dépenses, Employés, Unités de vente) : même structure, non mesurées. Échelle des couches ajoutée à `CLAUDE.md`.
- Commit 8 bis : `bafa7ee`, poussé (`577f62b`), CI verte. Vérifié en prod par Mahamadou : Render Live sur `577f62b`, logs sans erreur 500, achat comptant normal. Réponse de la route `/api/fournisseurs/dette_totale/` confirmée au 8 ter, via l'écran Fournisseurs. `check`, `makemigrations --check` et 576 tests backend OK (dont 10 dans `DetteTotaleFournisseursTests`) ; 5 mutations détectées.
- Commit 8 ter : `6a9deca`, poussé, CI verte. Vérifié en prod par Mahamadou le 2026-10-04 (Boutique 2) : « Total dû : 20 000 FCFA à 1 fournisseur », identique au badge, singulier correct ; après un paiement de 20 000 en Mobile Money depuis la fiche, « Aucune dette fournisseur en cours. » sans recharger la page ; journal de caisse cohérent (Dettes fournisseurs payées +20 000, Mobile Money +20 000). lint, build et 193 tests Vitest OK ; 7 mutations détectées.
- Suite : chantier « remboursements sur vente annulée et option B des ventes », terminé le 2026-10-05, voir plus bas.

### Principe

- `Achat` reçoit `statut_paiement` (défaut `paye`), `montant_du` (défaut 0), `montant_paye` (backfill puis NOT NULL, voir D4) et `mode_paiement` (nullable, null = « non précisé »).
- Sans `montant_paye` dans la requête, l'achat est comptant : même comportement qu'aujourd'hui, y compris pour un frontend encore en cache. Un achat à crédit exige un fournisseur.
- Une demande contradictoire est refusée (400), jamais corrigée en silence : par exemple un `mode_paiement` avec un acompte à 0.
- `PaiementFournisseur` est append-only, calqué sur `Remboursement` : corrections chaînées à l'original, `mode_paiement`, `enregistre_par`, isolation par `achat__boutique`.
- Le service `purchases/services/dette.py` est dupliqué depuis `sales/services/credit.py`, sans abstraction commune en v1 : on ne refactore pas le crédit client dans ce chantier. `select_for_update` sur l'`Achat`, et 0 ≤ total payé ≤ `montant_total`.
- L'annulation d'un achat est refusée s'il a déjà un paiement. L'acompte ne se corrige pas : on annule l'achat et on le ressaisit.
- Journal de caisse : `sorties.achats` = argent réellement versé (acompte + paiements), avec de nouvelles clés et une ventilation par mode. Non-régression : un achat comptant existant donne exactement les mêmes chiffres. Bandeau « payés comptant » adapté.
- Inchangés : résumé financier et ses exports (coût engagé), dashboard, assistant, ventes détaillées, notifications, stock et `prix_achat`.
- Pas de « reste à payer » calculé dans le formulaire d'achat : le reste dû s'affiche après la réponse du serveur.

### Décisions

- D1 (décidé le 2026-10-02) : offre unique, voir le chantier « Offre unique » plus bas. Aucun contrôle de palier pour les dettes fournisseurs : seulement le contrôle d'abonnement valide existant (`_verifier_acces`), comme pour les autres écritures.
- D2 : échéances et notifications plus tard (`date_echeance` nullable, additive).
- D3 : créer un achat à crédit est réservé au propriétaire en v1. Enregistrer un paiement fournisseur est permis à l'employé aussi, avec « Enregistré par » visible sur chaque paiement. Corriger un paiement est réservé au propriétaire.
- D4 : backfill `montant_paye = montant_total` pour les achats existants (une seule requête `update` avec `F()`), puis passage en NOT NULL. Un NULL ne veut dire qu'« inconnu ». Migration réversible, avec un test du backfill. Le NOT NULL vient dans un deuxième temps (commit 1 bis), car `migrate` tourne pendant que l'ancien code sert encore les requêtes.
- D5 : la suppression d'un fournisseur est refusée tant qu'il reste une dette (contrôle dans la vue, sans migration). Sous concurrence, la suppression et la création d'un achat verrouillent toutes deux le fournisseur (les clés étrangères Django n'étant vérifiées qu'au commit, elles ne suffisent pas). Cas inverse : si la suppression passe avant, la création de l'achat trouve le fournisseur disparu sous le verrou et renvoie la même réponse qu'un fournisseur inexistant (400 du champ `fournisseur`), sans rien créer.
- D6 : tuile au dashboard et outil pour l'assistant plus tard.
- D7 : journal, « À savoir » : crédit fournisseur obtenu et dette fournisseurs restante.
- D8 (modifiée le 2026-10-03) : le backend regroupe les corrections et calcule `montant_effectif` (par paiement) et `total_paiements` (par achat) dans l'historique fournisseur. Le frontend (commit 8) affiche ces valeurs sans rien calculer : pas de copie de `grouperRemboursements`. `formatEcart` (affichage seul) peut être dupliqué. Pas de refactor de `Clients.jsx` dans ce chantier.
- D9 : pas de paiement antidaté en v1 (date du serveur).

### Commits prévus

Backend d'abord (déployable seul), frontend ensuite (supporte l'absence des nouveaux champs).

1. `feat(purchases)` : champs de paiement sur `Achat`, migration avec backfill (D4). `montant_paye` reste nullable en base ; le nouveau code le remplit toujours.
1 bis. Contract, dans un commit et un déploiement séparés, une fois le commit 1 en ligne sur Render : 0018 refait le backfill des lignes encore vides (`update ... where montant_paye is null`), 0019 passe `montant_paye` en NOT NULL.
2. `feat(purchases)` : achat à crédit ou comptant avec acompte et mode (D1 et D3).
3. `feat(purchases)` : paiements fournisseurs append-only (modèle, service, verrou, bornes, test de concurrence à deux threads).
4. `feat(purchases)` : API des paiements et corrections ; annulation d'achat refusée si le total net des paiements est différent de 0 (option B, décidée le 2026-10-03 : un paiement corrigé à 0 n'a pas eu lieu ; l'acompte seul ne bloque pas).
5. `feat(suppliers)` : dettes par fournisseur (`avec_dette`, `historique`), suppression bloquée s'il reste une dette.
6. `feat(reports)` : journal de caisse, sorties = argent versé, par mode, avec non-régression. `sorties.achats` garde son nom avec le sens « argent versé » (acomptes à la date de l'achat + paiements fournisseurs à leur date). Option A (décidée le 2026-10-03) : les paiements d'un achat annulé sont comptés à leur date.
7. `feat(frontend)` : achat à crédit dans le formulaire d'achat (case réservée au propriétaire, montant versé, mode obligatoire seulement s'il est supérieur à 0, reste dû affiché après la réponse du serveur, badge « À crédit · reste X » dans l'historique). Un achat comptant envoie exactement le même objet qu'avant.
7 bis. `feat(frontend)` : mode de paiement demandé aussi pour un achat comptant (sélecteur obligatoire, sans valeur par défaut), juste après le 7 et avant le 9. Décidé le 2026-10-03. Le backend accepte et enregistre déjà ce mode (`test_mode_paiement_sans_montant_paye_conserve`), et le journal le range dans son mode (`test_ligne_non_precise_absente_sil_ny_en_a_pas`) : commit frontend seul. Il changera l'objet envoyé pour un achat comptant (ajout de `mode_paiement`) : le test de non-régression du 7 sera adapté.
   - Décision 1 : le mode de paiement est remis à zéro après chaque achat (choix explicite à chaque fois).
   - Décision 2 : un seul sélecteur « Mode de paiement », au même endroit pour tous les achats, juste au-dessus du bouton Valider. Il porte sur le total pour un achat comptant, sur le montant versé pour un achat à crédit, et il est absent si le montant versé est 0 (jamais envoyé dans ce cas, même si un mode avait été choisi avant de cocher « Achat à crédit »).
   - Pas de valeur par défaut ; sans mode, l'envoi est bloqué. Un employé voit le sélecteur (achat comptant) mais toujours pas la case crédit (D3).
   - Décision 3 (2026-10-03) : si on choisit un mode, qu'on coche puis décoche « Achat à crédit », le mode choisi reste sélectionné. Il est visible avant l'envoi : pas de piège caché.
8. `feat(frontend)` : dettes et paiements dans Fournisseurs.
   - Plan validé le 2026-10-03. Badge « Doit X » (`avec_dette`, ancienneté colorée comme pour les clients) ; bouton « Dettes et paiements » qui ouvre la fiche du fournisseur (calquée sur `FicheClient`) : achats à crédit avec total, payé à l'achat et son mode, reste dû, badges « Partiel », « Soldé », « Annulé » ; paiements avec montant effectif, mode et « Enregistré par » ; corrections avec écart et motif. Aucun montant calculé : valeurs de l'API, bornes vérifiées par le serveur.
   - `avec_dette` en échec : silencieux seulement pour un 404 (route absente, backend antérieur) ; toute autre erreur (réseau, 500) affiche « Impossible de charger les dettes fournisseurs », pour ne pas laisser croire qu'il n'y a aucune dette.
   - Achats soldés gardés dans la fiche (badge « Soldé »). Montant du paiement jamais prérempli. Mode de paiement obligatoire, sans valeur par défaut. Paiement : employé et propriétaire ; correction : propriétaire seulement, jamais sur un achat annulé (D3). Vue support : formulaire et « Corriger » masqués, comme dans la fiche client.
   - À 375 px, les lignes de paiement passent à la ligne au lieu d'être tronquées : « Enregistré par » reste lisible (D3).
8 bis. `feat(suppliers)` : total dû à tous les fournisseurs, calculé par le backend (le frontend ne fait pas la somme). Commit backend séparé, après le 8 (décidé le 2026-10-03).
   - Plan validé le 2026-10-03 : `GET fournisseurs/dette_totale/` renvoie `{"dette_totale": "X.XX", "nombre_fournisseurs": N}` (non paginé). Une requête d'agrégat sur le même queryset et le même filtre que `avec_dette` : le total vaut, par construction, la somme de leurs `dette_totale`. Montant en chaîne, `"0.00"` et `0` sans dette, jamais null. Accès comme `avec_dette` : isolation par boutique, vue support, employé (D3), lecture permise avec un abonnement expiré. Ni migration, ni frontend.
8 ter. `feat(frontend)` : affichage du total en haut de l'écran Fournisseurs (« Total dû : X à N fournisseurs »), après le déploiement du 8 bis sur Render (décidé le 2026-10-03). Même traitement des erreurs que `avec_dette` : silencieux sur un 404 (backend antérieur), message discret sur toute autre erreur.
   - Plan validé le 2026-10-03. Montant de l'API tel quel, jamais la somme des badges. Sans dette : « Aucune dette fournisseur en cours. ». Erreur du total : message distinct (« Impossible de charger le total dû aux fournisseurs. »), chaque appel gère sa propre erreur. Total rechargé après chaque paiement ou correction, comme les badges.
9. `feat(frontend)` : journal de caisse, sorties par mode, bandeau adapté. Vient **après le petit chantier « bouton flottant »** (décidé le 2026-10-03). Part **avant ou avec le commit 8** (décidé le 2026-10-03) : sans lui, l'ancien `JournalCaisse.jsx` afficherait « aucun mouvement » un jour où il n'y a que des paiements fournisseurs.
   - État vide : ajouter `sorties.nombre_paiements_fournisseurs` à la condition ; clé absente (backend antérieur) : pas d'état vide, comme `nombre_remboursements`.
   - Bandeau : achats = argent réellement versé (acomptes et paiements fournisseurs), par mode ; « non précisé » = achats enregistrés avant le suivi du mode ; les dépenses restent supposées payées comptant.
   - « À savoir » : `credit_fournisseur_obtenu` et `dette_fournisseurs_restante` ne portent que sur les achats de la période. Libellé comme pour les clients : « Acheté à crédit sur la période : X, dont encore dû aujourd'hui : Y ». La dette totale par fournisseur reste dans l'écran Fournisseurs.
   - Chaque nouveau champ peut être absent (ligne masquée).
   - Décisions du 2026-10-03 : « Acheté à crédit » toujours affiché, même à 0, comme « Vendu à crédit » (cohérence). Sous la ligne « Achats », deux sous-lignes : « Payé à l'achat » (`acomptes_achats`, `nombre_achats`) et « Dettes fournisseurs payées » (`paiements_fournisseurs`, `nombre_paiements_fournisseurs`). Dans « À savoir » : « Si un achat à crédit est annulé, ses paiements restent à leur date et s'annulent entre eux. »
   - Achats par mode : une seule liste ; les modes à 0 sont masqués sur téléphone seulement, comme pour les entrées.

## Petit chantier prioritaire : bouton flottant de l'assistant

Passé en priorité le 2026-10-03, avant le commit 9 : depuis le 7 bis, à 375 px, le bouton flottant recouvre un champ obligatoire (le sélecteur « Mode de paiement » du formulaire d'achat), en plus du « Montant Total ». Plan révisé validé le 2026-10-03. Correctif : `ed7c70c`.

- Décision (2026-10-03) : Iwi reste visible sur mobile (argument de vente, commerçants surtout sur téléphone). On essaie d'abord la solution la plus simple : agrandir la marge basse de `main` (`App.jsx`), sur mobile et en desktop, pour que la fin de toute page puisse défiler au-dessus du bouton. Les champs du milieu de page se dégagent en défilant, comme avec tout bouton flottant. Si ça ne suffit pas, on reparlera de l'en-tête.
- Décision (2026-10-03) : le cas « milieu de page » est accepté, y compris pour Valider à 375 px (il se dégage en défilant). On ne reparle de l'en-tête que si des commerçants s'en plaignent.
- Constat : `Assistant.jsx`, bouton de 56 px en `fixed bottom-20 right-4` (mobile), `md:bottom-6 md:right-6`. Son haut est à 136 px du bas de l'écran sur mobile, 80 px en desktop. La marge basse de `main` n'est que de 96 px (`pb-24`) sur mobile et 24 px (`md:pb-6`) en desktop : même tout en bas d'une page, les derniers 40 px (mobile) ou 56 px (desktop) du contenu restent sous le bouton.
- Correctif prévu : `pb-36` (144 px) sur mobile et `md:pb-24` (96 px) en desktop, soit 8 px et 16 px de marge au-dessus du bouton. Une seule ligne de `App.jsx`, valable pour toutes les pages.
- Mesure Playwright faite le 2026-10-03, avant correctif (API simulée, panier d'une ligne, historique de 2 achats puis vide) :
  - En fin de page, le bas du contenu est sous le haut du bouton : 716 px contre 676 px à 375 px (écran de 812 px), 876 px contre 820 px en desktop (écran de 900 px). En desktop, avec un historique, le bouton « Annuler l'achat #40 » est sous Iwi.
  - **Limite** : à 375 px, le formulaire d'achat n'est jamais en fin de page (l'historique le suit, même vide). Quand on fait défiler juste assez pour voir Valider au-dessus de la barre du bas, Valider est sous Iwi, avec ou sans le correctif. Il se dégage en défilant d'environ 70 px de plus (bas de Valider à 748 px, haut d'Iwi à 676 px). La marge seule ne change donc rien à ce cas : c'est le cas « milieu de page ».
- Preuves prévues :
  - Mesure Playwright, à 375 px et en desktop, sur Achats, vue échouer avant le correctif : défilement jusqu'en bas de la page, le bas du contenu de `main` est au-dessus du haut du bouton Iwi, et aucun champ ni bouton n'est sous Iwi (en desktop : plus de « Annuler l'achat #40 »).
  - Formulaire d'achat à 375 px : il existe une position de défilement où tous ses champs et Valider sont hors du bouton Iwi (vrai avant et après : constat, pas preuve du correctif).
  - Captures d'Achats à 375 px et en desktop, en fin de page.
- Résultat (2026-10-03) : la mesure échouait avant le correctif (4 échecs) et passe après. En fin de page, bas du contenu à 668 px pour un bouton à 676 px (375 px), 804 px pour 820 px en desktop, aucun élément sous le bouton. Le constat « milieu de page » passe avant et après. Le script Playwright n'est pas dans la CI (jsdom ne calcule pas la mise en page). Un commentaire dans `Assistant.jsx` rappelle le lien entre la position du bouton et la marge de `main`.

## Terminé le 2026-10-05 : remboursements sur vente annulée et option B des ventes

Analyse du code faite le 2026-10-04 (sans coder, bug non reproduit par un test). Plan validé le 2026-10-04 par Mahamadou. Chantier terminé le 2026-10-05 : les commits 1, 3, 2 et 2 bis sont poussés, CI verte, vérifiés en prod par Mahamadou. Suite : chantier « offre unique », voir plus bas.

- Commit 1 : `a04168d`, poussé le 2026-10-05, CI verte (run GitHub Actions 37280078868, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2) : vente à crédit V-AD91351B de 6 000 annulée, remboursement de 5 000 refusé avec « Impossible d'enregistrer un remboursement sur une vente annulée. », Payé reste à 0 ; l'ancien frontend affiche bien le message du serveur. Constat au passage : sur cette vente annulée, la fiche client affiche le badge « En attente » et « Dû 6 000 FCFA » en rouge, comme si le client devait encore 6 000 (à traiter par le commit 3). Contrôle du statut dans `enregistrer_remboursement`, sous le verrou. Deux tests vus échouer avant le correctif (201 au lieu de 400) : `RemboursementVenteAnnuleeTests` (0 ligne créée, `montant_du` et `statut_paiement` inchangés) et `AnnulationVenteRemboursementConcurrenceTests` (le remboursement attend le verrou de l'annulation, vérifié dans `pg_stat_activity`, puis est refusé). `check`, `makemigrations --check` et 578 tests backend OK. L'ordre inverse (remboursement d'abord, annulation ensuite) n'est pas testé ici : il change avec le commit 2 (option B).
- Commit 3 : plan validé le 2026-10-05 par Mahamadou (voir ci-dessous), `b61feee`, poussé le 2026-10-05 avec les commits doc `709eed1` et `59dae5f`, CI verte (run GitHub Actions 37284157391, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, fiche de Bintou) : V-AD91351B carte grise, badge « Annulée », Dû « — » en gris, phrase affichée, aucun formulaire ; V-2F621063 inchangée (Partiel, Dû 10 000 en rouge, formulaire). Corps du `<li>` volontairement pas réindenté (diff lisible) ; pas de commit de style : extraction prévue en composant, voir les chantiers séparés.
  - Badge gris « Annulée » à la place du badge de paiement, carte grisée. « Dû » : « — » en gris au lieu de `montant_du` (pas de « 0 » inventé), et la phrase « Vente annulée : le client ne doit rien sur cette vente. ». Net et Payé inchangés.
  - Formulaire de remboursement et bannière Premium masqués ; « Corriger » l'était déjà ; les remboursements existants restent visibles.
  - `statut` absent (backend antérieur) : affichage d'avant, jamais d'annulation déduite d'un autre champ. En pratique `statut` est dans `HistoriqueClientSerializer` depuis `157e2c5`.
  - Preuves : 5 tests dans `Clients.test.jsx` ; 3 vus échouer avant le correctif, 2 de non-régression qui passaient déjà (statut absent, remboursements visibles sans « Corriger »). 7 mutations détectées. lint, build et 198 tests Vitest OK (287 s). Captures à 375 px et en desktop.
- Commit 2 : plan validé le 2026-10-05 par Mahamadou, avec son message de refus. `908513f`, poussé le 2026-10-05 avec les commits doc `c6139b7` et `af07675`, CI verte (run GitHub Actions 37291373031, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, Bintou) : vente #28 (V-FB40E0D5) de 6 000 avec un remboursement de 5 000, annulation refusée avec « 5 000 FCFA de remboursements sont déjà enregistrés sur cette vente : corrigez-les à 0 avant de l'annuler. » ; remboursement corrigé à 0 (motif saisi), puis annulation acceptée ; fiche client : vente « Annulée », remboursement barré et correction −5 000 visibles en lecture seule ; journal de caisse du jour : +5 000 et −5 000 se compensent, les 2 lignes sont comptées.
  - Annulation : refusée seulement si le total net des remboursements (corrections comprises, lu sous le verrou de la vente) est différent de 0. Message : « X de remboursements sont déjà enregistrés sur cette vente : corrigez-les à 0 avant de l'annuler. » (« ont déjà été remboursés » écarté : on pourrait croire que la boutique a rendu l'argent au client).
  - Journal : filtre `vente__statut='VALIDEE'` retiré des remboursements, comptés à leur date. Sans effet sur les chiffres passés (requête du 2026-10-05 : 0 ligne).
  - Preuves : 5 tests vus échouer avant le correctif (message, correction partielle, correction à 0 puis annulation, journal, concurrence dans le sens « remboursement d'abord ») ; 3 de non-régression qui passaient déjà (acompte seul, sans remboursement, concurrence du commit 1). 5 mutations détectées, dont le total lu hors verrou. `check`, `makemigrations --check` et 583 tests backend OK. Sans migration.
  - Limites inchangées : l'acompte d'une vente annulée disparaît du jour de la vente (pas de `date_annulation`) ; corriger exige le Premium, donc une boutique redescendue ne peut ni ramener le total à 0 ni annuler (déjà le cas en option A, réglé par l'offre unique).
- Commit 2 bis : validé le 2026-10-05, `f8f88cc`, poussé le 2026-10-05 avec le commit doc `b3ca9af`, CI verte (run GitHub Actions 37293371621, succès). Vérifié en prod par Mahamadou le 2026-10-05 : la phrase s'affiche dans « À savoir » du journal de caisse, juste avant celle des achats. Affichée sans condition (le commit 2 n'a ajouté aucune clé qui permettrait de reconnaître un backend antérieur). Test dans le bloc principal de `JournalCaisse.test.jsx`, vu échouer sans la phrase ; lint, build et 199 tests Vitest OK. `feat(frontend)` séparé, après le commit 2 : phrase « À savoir » du journal de caisse, « Si une vente à crédit est annulée, ses remboursements restent à leur date et s'annulent entre eux. », comme celle des achats.

### Analyse

- Bug : un remboursement est accepté sur une vente annulée. Aucune couche ne vérifie le statut à la création : `RemboursementSerializer.validate` (montant > 0, ≤ `montant_du`), `RemboursementViewSet.perform_create` (accès, Premium, boutique), `enregistrer_remboursement` (verrou, montant). Seule la correction refuse une vente annulée (`corriger_remboursement`), comme `enregistrer_paiement` côté fournisseurs.
- Chemin réel : `VenteViewSet.annuler` ne change que `statut`, une vente à crédit annulée garde son `montant_du` > 0. La fiche client affiche le formulaire « Enregistrer un remboursement » dès que `montant_du` > 0 (`Clients.jsx`), sans regarder le statut, et n'affiche pas « Annulée » (seulement le badge de paiement).
- Conséquences : l'argent reçu n'apparaît pas au journal de caisse (`reports/caisse.py`, filtre `vente__statut='VALIDEE'`) ; le remboursement ne peut pas être corrigé. Les dettes affichées ne bougent pas (`dette_totale_client`, `avec_dette`, assistant, notifications excluent déjà les ventes annulées).
- Annulation des ventes : option A (`annuler` refuse dès que `vente.remboursements.exists()`, même corrigés à 0, message sans issue). Achats : option B (refus seulement si le total net versé ≠ 0, message qui dit quoi faire).
- Lien avec le journal : en option B, une vente annulée peut avoir des lignes de remboursement (+5000 puis -5000). Avec le filtre `vente__statut='VALIDEE'`, elles disparaîtraient après coup des jours passés : il faut les compter à leur date, comme les paiements fournisseurs. Le commentaire de `caisse.py` (« ne peut pas être annulée ») deviendra faux.
- Concurrence : `annuler`, `enregistrer_remboursement` et `corriger_remboursement` verrouillent la même vente (`select_for_update`) ; il manque seulement le contrôle du statut dans `enregistrer_remboursement`.
- Modèle pour le chantier « réponses périmées » : `SalesHistory.jsx` ignore déjà les réponses périmées (`let annule = false`).

### Plan validé (3 commits, ordre 1 → 3 → 2)

1. `fix(sales)` : refuser un remboursement sur une vente annulée. Contrôle seulement dans `enregistrer_remboursement`, sous le verrou (pas dans le serializer) : « Impossible d'enregistrer un remboursement sur une vente annulée. » Test vu échouer avant le correctif ; test de concurrence à deux threads (annulation contre remboursement). Déployable seul, sans migration.
3. `feat(frontend)` : fiche client, badge « Annulée » et formulaire de remboursement masqué sur une vente annulée (aujourd'hui seul « Corriger » l'est). Le message de refus d'annulation s'affiche déjà tel quel dans l'Historique des ventes.
2. `feat(sales)` : annulation des ventes en option B (refus seulement si le total net remboursé ≠ 0, message comme pour les achats ; l'acompte ne bloque pas, limite connue sans `date_annulation`) et journal de caisse qui compte les remboursements d'une vente annulée à leur date (retrait du filtre `vente__statut='VALIDEE'`). Les deux ensemble. Adapter `test_annulation_refusee_si_remboursement_deja_enregistre`, tests de non-régression du journal.
   - **Seulement après la requête SQL** que Mahamadou lancera lui-même avec psql, en lecture seule, sur la base de prod. 0 ligne : le retrait du filtre ne change aucun chiffre passé. Des lignes : décider ensemble avant de toucher au journal.
     ```sql
     SELECT v.boutique_id, COUNT(r.id) AS lignes, SUM(r.montant) AS total
     FROM sales_remboursement r JOIN sales_vente v ON v.id = r.vente_id
     WHERE v.statut = 'ANNULEE'
     GROUP BY v.boutique_id;
     ```
   - Résultat (2026-10-05) : requête lancée par Mahamadou sur la prod avec psql, en lecture seule (`BEGIN READ ONLY`, puis `ROLLBACK`). Remboursements sur ventes annulées : **0 ligne**. Contrôle du filtre : `SELECT statut, COUNT(*) FROM sales_vente GROUP BY statut` donne ANNULEE 3, VALIDEE 24 ; le filtre est juste, le 0 est réel. Conclusion : retirer le filtre `vente__statut='VALIDEE'` du journal ne change aucun chiffre passé. Le commit 2 est débloqué (plan à valider).

## Terminé le 2026-10-05 : offre unique

Décidé le 2026-10-02 : iWiShop passe à une offre unique. Un abonnement valide donne accès à toutes les fonctionnalités, sans palier Essentiel ou Premium. À faire après les dettes fournisseurs. Plan d'abord, rien de codé.

Chantier terminé le 2026-10-05 : les commits 1 à 4 sont poussés, CI verte, vérifiés en prod par Mahamadou ; le nettoyage (tests seuls, rien à vérifier en prod) part avec ce commit doc, qui est le 5. Plus aucun code ne lit le palier. La colonne `FormuleAbonnement.palier` n'est plus lue, mais reste en base et dans l'admin (décision 3) : une nouvelle formule exige toujours une valeur, n'importe laquelle. Suite : chantier « bandeau après l'expiration et code `ABONNEMENT_EXPIRE` », voir plus bas.

Prochaine étape (décidée le 2026-10-05) : analyse du code d'abord, sans coder, en commençant par le retrait de `verifier_acces_premium` du crédit client. Analyse faite et découpage validé le 2026-10-05 (ci-dessous).

### Analyse (2026-10-05)

- Une seule source côté backend : `Boutique.a_acces_premium()` (`tenants/models.py`), qui vaut abonnement valide **et** `formule.palier == 'PREMIUM'`, et faux sans abonnement. Utilisée par `verifier_acces_premium()` (`tenants/premium.py`, 403 avec le code `PALIER_INSUFFISANT`) dans 4 écritures du crédit client (voir le tableau plus bas), et exposée par `MonAbonnementView` (`a_acces_premium`). Le palier n'est lu nulle part ailleurs : ni achats à crédit (D1), ni notifications, ni assistant, ni PayDunya (`creer_facture` et `confirmer_paiement` ne lisent que la formule), ni page des tarifs (`FormuleAbonnementSerializer` n'expose que `id`, `nom`, `duree_jours`, `prix`).
- Frontend : tout passe par `aAccesPremium` (`SettingsContext.jsx`, `?? null`, ne bloque que sur un `false` confirmé) : `Sales.jsx`, `Clients.jsx`, `JournalCaisse.jsx` (colonne), `PremiumRequisBanner.jsx`, `CODE_PALIER_INSUFFISANT` (`errorUtils.js`), lien vers « Mon abonnement » (`App.jsx`).
- Stockage : `FormuleAbonnement.palier` (`ESSENTIEL` ou `PREMIUM`), NOT NULL sans `db_default` (migrations 0011 à 0013). Une boutique a au plus un `Abonnement` (OneToOne) ; son palier est celui de la formule de cet abonnement ; un renouvellement change la formule (`confirmer_paiement`).
- Expiration aujourd'hui (« valide » = statut `ACTIF` et `date_debut` ≤ aujourd'hui ≤ `date_fin` ; `EXPIRE` n'est jamais posé par le code) : toutes les écritures sont refusées (403 « Abonnement expiré. Merci de renouveler votre abonnement. », `_verifier_acces`, vérifié avant le Premium) ; une vente hors ligne synchronisée après coup passe en `ECHEC_AUTRE` et reste visible. Restent accessibles : connexion, lectures, rapports, journal, exports, « Mon abonnement » et paiement PayDunya, notifications, assistant. À l'écran, une boutique Premium expirée voit le crédit grisé avec le message « palier Premium » (trompeur).
- Prod (requêtes en lecture seule lancées par Mahamadou le 2026-10-05) : 3 formules, toutes en `PREMIUM` (« Essai gratuit » 3 000 / 14 j, « 1 MOIS » 15 000 / 30 j, « 3 MOIS » 45 000 / 90 j), chacune avec 1 abonnement en cours ; aucune formule Essentiel, l'offre unique ne change rien pour les clients actuels. Les 3 ont été passées en `PREMIUM` à la main dans l'admin pour contourner les paliers : **ne pas y toucher pendant la transition**. 1 boutique sans abonnement : id 1, « Ma Boutique », active (boutique d'administration).
- « Essai gratuit » : attribuée automatiquement à l'approbation d'une demande (`ApprouverDemandeView`), trouvée **par son nom** (la renommer bloque toute nouvelle inscription) ; son prix n'est pas lu à l'inscription. Seule une formule `actif=True` est en vente (`CreerPaiementView`).

### Décisions (2026-10-05)

1. Expiration : comportement actuel conservé (lecture seule : écritures bloquées ; lectures, exports et renouvellement accessibles).
2. `a_acces_premium()` renvoie exactement `abonnement_valide()`, y compris pour une boutique sans abonnement. Une seule règle partout.
3. La colonne `palier` et son champ dans l'admin restent (aucune suppression), pour pouvoir créer de vrais paliers plus tard dans un chantier dédié.
4. Hors de ce chantier : voir « En attente, côté code » (pas d'abonnement = accès autorisé, bandeau après expiration, assistant après expiration, `marquer_lue`, prix de l'essai).

### Commits prévus (découpage validé le 2026-10-05, chacun déployable seul, sans migration)

1. `feat(tenants)` : `a_acces_premium()` = `abonnement_valide()`, le palier n'est plus lu. L'ancien frontend se débloque seul (`a_acces_premium` passe à vrai pour une boutique valide). Tests `AccesPremiumTests` et `AccesPremiumCreditTests` inversés, vus échouer avant.
   - Fait : `1ae07bd`, poussé le 2026-10-05 avec le commit doc `e006075`, CI verte (run GitHub Actions 37300151394, succès). Vérifié en prod par Mahamadou le 2026-10-05 : « Ma Boutique » (id 1, sans abonnement), « Ajouter un client » cliquable et un client créé avec succès ; Boutique 2 inchangée (bouton actif, Bintou et ses ventes intactes). Preuves : 8 échecs sur 16 avant le correctif, 5 mutations détectées, 586 tests backend OK, sans migration. `MonAbonnementView` renvoie aussi `a_acces_premium()` dans la branche « sans abonnement » (au lieu de `False` en dur).
2. `refactor(sales)` : retrait des 4 appels à `verifier_acces_premium` et de `tenants/premium.py` (sans effet après le 1 : `_verifier_acces` contrôle déjà l'abonnement juste avant).
   - Fait : `6b7e1a7`, poussé le 2026-10-05 avec le commit doc `cb489b1`, CI verte (run GitHub Actions 37303618877, succès). Vérifié en prod par Mahamadou le 2026-10-05 : Render Live sur `6b7e1a7`, logs sans erreur 500, vente à crédit de 500 réussie dans « Ma Boutique ». Retrait sans effet sur le comportement (chaque appel était précédé de `_verifier_acces` sur la même boutique) ; le test d'expiration couvre maintenant les 4 écritures (remboursement et correction ne l'étaient pas), 4 mutations détectées (retrait de chaque `_verifier_acces`), 586 tests backend OK.
   - Nettoyage fait (petit commit séparé, juste avant ce commit doc) : `_donner_acces_premium` renommée `_donner_abonnement_valide` (`sales/tests.py`, 11 occurrences), puisque « Premium » ne veut plus rien dire ; 580 tests backend OK.
3. `feat(frontend)` : retrait de l'affichage Premium (`premiumRefuse`, `PremiumRequisBanner`, `CODE_PALIER_INSUFFISANT`, colonne du journal toujours visible, `aAccesPremium`). Après le 1 sur Render.
   - Plan validé le 2026-10-05. Retrait pur : une boutique expirée voit le refus du serveur (« Abonnement expiré. Merci de renouveler votre abonnement. ») en `alert()` pour l'ajout d'un client et la vente à crédit, dans la page pour le remboursement et la correction, comme pour ses autres écritures ; saisie et panier conservés. Un ancien backend qui renverrait `PALIER_INSUFFISANT` suit le même chemin (message `detail` affiché tel quel).
   - Décision (2026-10-05) : `abonnement` reste dans `SettingsContext` (plus lu par personne après ce commit), uniquement pour le chantier « bandeau après l'expiration ». `getErrorCode` reste aussi (servira au code `ABONNEMENT_EXPIRE`).
   - Fait : `46dfea7`, poussé le 2026-10-05 avec le commit doc `5798986`, CI verte (run GitHub Actions 37307392898, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, après Ctrl+Shift+R) : case « Vente à crédit » active, « Ajouter un client » actif, formulaire de remboursement et « Corriger » présents dans la fiche de Bintou, colonne « Remboursements de dettes » visible dans la caisse, aucun « Premium » nulle part. Preuves : 7 tests vus échouer sur 57, 7 mutations détectées, lint, build et 204 tests Vitest OK, grep sans Premium ni PALIER hors des tests, captures (boutique expirée simulée).
4. `refactor(tenants)` : retrait du champ `a_acces_premium` de `mon-abonnement` et de la méthode. Après le 3 sur Vercel (un frontend en cache obtient `null`, qui ne bloque rien).
   - Fait : `c163c85`, poussé le 2026-10-05 avec le commit doc `138360e`, CI verte (run GitHub Actions 37309092226, succès). Vérifié en prod par Mahamadou le 2026-10-05 : Render Live sur `c163c85`, logs sans erreur 500, « Mon abonnement » s'affiche normalement (1 MOIS et 3 MOIS), « Ajouter un client » et la vente à crédit marchent. Grep avant de coder : plus aucun lecteur de `a_acces_premium` (backend, assistant, notifications, admin, frontend). `AccesPremiumTests` remplacée par `MonAbonnementOffreUniqueTests` (4 échecs sur 4 avant le retrait), 3 mutations détectées, 580 tests backend OK.
5. `docs` : section « Fonctionnalités réservées au Premium » marquée terminée ; colonne `palier` notée inutilisée.
   - Fait : ce commit doc.

- Retirer `verifier_acces_premium` du crédit client (les 4 appels : `sales/serializers.py` `VenteSerializer.create`, `sales/views.py` `ClientViewSet.perform_create`, `RemboursementViewSet.perform_create` et `RemboursementViewSet.corriger`), et l'affichage frontend lié (bannière, boutons grisés, colonne masquée du journal). Voir l'inventaire ci-dessous.
- Garder le contrôle d'abonnement valide (`_verifier_acces`).
- Inventorier ce qui dépend encore des paliers : formules en base, PayDunya, pages de prix, tests.
- Règle aussi le point « boutique redescendue du Premium » (section « En attente, côté code »).

## En cours : refus après l'expiration (option B) et code `ABONNEMENT_EXPIRE`

Décidé le 2026-10-05, juste après l'offre unique. Analyse et découpage validés le 2026-10-05 ; commits 1 à 6 poussés et vérifiés en prod (5 et 6 regroupés).

Prochaine étape : le commit 7. Le chantier prioritaire « sauvegarde de la base » passe d'abord (étape B réussie le 2026-10-14, étapes C et D à venir).

Décision produit de Mahamadou (2026-10-05) :
- **Pas de bandeau permanent** après l'expiration : on ne harcèle pas le client.
- **Option B** : quand une boutique expirée essaie d'enregistrer quelque chose, le refus s'affiche **dans la page** (plus d'`alert()` pour ce refus), avec un bouton « Renouveler » qui ouvre Mon Abonnement **dans une fenêtre par-dessus l'écran** (décidé au commit 3, au lieu d'un passage à Paramètres → Mon Abonnement, qui démonterait l'écran et perdrait le panier).
- La saisie n'est jamais perdue (panier, formulaire).

Constat en prod de Mahamadou (2026-10-05, Boutique 2 mise expirée dans l'admin, puis remise) : aucun bandeau après l'expiration, « Expiré » visible seulement dans Mon Abonnement ; une vente comptant donne un `alert()` « Abonnement expiré. Merci de renouveler votre abonnement. » avec le panier intact.

### Analyse (2026-10-05)

- Une seule source côté serveur : `_verifier_acces` (`tenants/mixins.py`), 403 `{"detail": "Abonnement expiré. Merci de renouveler votre abonnement."}`, sans code.
- 25 écritures dans le frontend peuvent recevoir ce refus ; 21 l'affichent en `alert()`, 4 dans la page (remboursement et correction dans la fiche client, paiement et correction dans la fiche fournisseur), aucune avec un bouton « Renouveler ». Écrans : Ventes (vente, nouveau client à crédit), Historique (annulation), Clients (ajout, remboursement, correction), Achats (enregistrement, annulation), Fournisseurs (création, modification, suppression, paiement, correction), Dépenses (création, annulation), Produits (création, modification, prix par unité, suppression), Stock (mouvement), Catégories, Unités de vente, Paramètres (boutique), Employés (création, désactivation, réactivation). Saisie toujours conservée.
- Pas bloqués par l'expiration : connexion, « Mon abonnement » et paiement PayDunya, mot de passe, assistant (voir plus bas), `marquer_lue`.
- Code sans casser les anciens frontends : `PermissionDenied({"detail": <même texte>, "code": "ABONNEMENT_EXPIRE"})`, comme l'ancien `verifier_acces_premium`. Un ancien frontend lit `detail` (même texte) ; les `assertIn("Abonnement expiré", ...)` des tests restent valables.
- Solution réutilisable : `errorUtils.js` (`CODE_ABONNEMENT_EXPIRE`, `estAbonnementExpire`, `alerterErreur`, `messageErreur`) qui **signale** l'expiration (évènement de fenêtre) au lieu d'ouvrir une `alert` ; un composant `RefusAbonnementExpire.jsx` monté une seule fois dans `App.jsx`, invisible tant qu'aucun refus n'a eu lieu ; une ligne changée par endroit dans chaque écran. Pas de signal dans l'intercepteur d'`api.js` (un écran pas encore modifié afficherait l'`alert` et le message). Face à un ancien backend sans code, l'écran garde l'`alert` d'aujourd'hui.
- Ventes hors ligne : aujourd'hui, 403 à la synchronisation, vente en `ECHEC_AUTRE` (jamais perdue), bandeau « N ventes en attente » sans la raison, et toutes les ventes renvoyées à chaque relance. Proposé : statut `ECHEC_ABONNEMENT` relançable, arrêt de la boucle (comme le 401), raison et bouton dans le bandeau.
- Assistant Iwi : réservé au propriétaire (`IsOwner` côté serveur, bouton masqué aux employés). `AssistantView.post` n'appelle pas `_verifier_acces` : une boutique expirée peut poser des questions (coût en tokens, seul le quota quotidien limite). Où bloquer : appeler `self._verifier_acces(boutique)` en tête de `post`, avant le contrôle de la question, le quota et tout appel à Anthropic (aucune `RequeteAssistant` créée, donc le quota n'est pas consommé). Côté écran, l'erreur s'affiche déjà dans le panneau d'Iwi (`Assistant.jsx`, état `erreur`) : `messageErreur` suffit. Un ancien frontend affiche le `detail` dans le panneau.

### Décisions (2026-10-05)

1. Message fixé en haut de l'écran, couche `z-50` (visible même en bas d'une longue page ; rendu après le contenu, il passe devant une fenêtre ouverte).
2. Textes (validés mot pour mot) :
   - Propriétaire : « Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée. », avec le bouton « Renouveler ».
   - Employés : « Abonnement expiré : prévenez le propriétaire de la boutique. », sans bouton « Renouveler ».
3. Vente hors ligne faite avant l'expiration et synchronisée après : règle actuelle gardée (refusée, puis envoyée après le renouvellement), car l'heure du téléphone (`horodatage_client`) est falsifiable.
4. L'assistant Iwi est bloqué après l'expiration (coût en tokens) : même code, même message, même bouton (propriétaire seulement, l'assistant lui étant réservé).

### Commits prévus (chacun déployable seul, sans migration)

1. `feat(tenants)` : code `ABONNEMENT_EXPIRE` dans `_verifier_acces`. Tests du code et du texte inchangé sur plusieurs écrans, vus échouer avant.
   - Fait : `0d9352c`, poussé le 2026-10-05 avec le commit doc `1eb7144`, CI verte (run GitHub Actions 37315236819, succès). Vérifié en prod par Mahamadou le 2026-10-05 : Render Live sur `0d9352c`, logs sans erreur 500, vente normale OK. `RefusAbonnementExpireCodeTests` : réponse exacte sur 6 écritures (création d'une catégorie et d'un client, modification d'un fournisseur et d'un produit, annulation d'une vente et d'une dépense), 6 échecs avant ; boutique désactivée sans code ; 4 mutations détectées ; 584 tests backend OK.
2. `feat(assistant)` : `_verifier_acces` en tête d'`AssistantView.post` (refus avant le quota et avant Anthropic).
   - Fait : `f7f04ec`, poussé le 2026-10-05, CI verte (run GitHub Actions 37317694337, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2) : expirée dans l'admin, Iwi affiche « Abonnement expiré. Merci de renouveler votre abonnement. » sans répondre ; date remise, Iwi répond normalement. `AssistantAbonnementExpireTests` (client Anthropic mocké) : refus sans appel à Anthropic ni `RequeteAssistant` créée, refus avant le quota (au lieu de 429), avant la question vide (au lieu de 400), avant la clé absente (au lieu de 503), 4 échecs avant ; `test_boutique_desactivee_refusee_sans_ce_code` (effet voulu : refus « Cette boutique a été désactivée. », sans code, Anthropic jamais appelé, 0 ligne), vu échouer sans le contrôle (200 au lieu de 403) ; 5 mutations détectées (contrôle retiré puis déplacé après chacun des contrôles) ; 590 tests backend OK.
3. `feat(frontend)` : socle (`errorUtils`, `RefusAbonnementExpire`, fenêtre « Renouveler », message employé) et Ventes.
   - Fait : `42c780d`, poussé le 2026-10-05 avec le commit doc `3fd1802`, CI verte (run GitHub Actions 37343145197, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2 expirée dans l'admin, puis remise) : message « Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée. » avec « Renouveler », aucun `alert()` ; Mon Abonnement s'ouvre par-dessus l'écran, panier intact ; le bandeau orange J-3 (`AbonnementBanner`) marche toujours. Message employé non vérifié en prod (prouvé par les tests et les captures). Preuves : 13 tests (`errorUtils.test.js`, `RefusAbonnementExpire.test.jsx`), 5 échecs sur 7 avec l'ancien `Sales.jsx` ; 11 mutations détectées, dont « un message par refus » ; lint, build et 217 tests Vitest OK ; captures Playwright à 375 px et en desktop.
   - Décisions du commit 3 (2026-10-05) :
     - `errorUtils.js` : `CODE_ABONNEMENT_EXPIRE`, `estAbonnementExpire` (403 **et** code), `alerterErreur(err, fallback)`, qui remplace `alert(getErrorMessage(...))` dans les écrans : sur ce refus, un évènement de fenêtre au lieu de l'`alert` ; toute autre erreur, et l'ancien backend (même texte, sans code), gardent l'`alert` d'avant.
     - `RefusAbonnementExpire.jsx`, monté une seule fois à la fin d'`App.jsx` : message fixé en haut, `z-50`, textes de la décision 2, bouton « Fermer le message ». **Un seul message**, quel que soit le nombre de refus (deux refus presque en même temps n'en affichent qu'un) ; il revient au refus suivant s'il a été fermé.
     - « Renouveler » ouvre Mon Abonnement (`MonAbonnement.jsx` tel quel) dans une fenêtre `z-50`, rendue après le message (elle passe devant) ; l'écran reste monté dessous, panier et saisie conservés à la fermeture.
     - Utilisateur pas encore chargé (`est_proprietaire` inconnu) : texte du propriétaire, sans bouton.
     - Ventes : les deux `alert` d'erreur serveur (création du nouveau client à crédit, enregistrement de la vente) passent par `alerterErreur`.
     - `messageErreur` (erreurs affichées dans la page) reporté au commit 4, premier écran qui s'en sert.
   - Limites connues : choisir une formule envoie vers PayDunya (page quittée, comme aujourd'hui depuis Mon Abonnement) : le panier est alors perdu. En desktop, le message recouvre une partie de la navigation tant qu'il n'est pas fermé (décision 1). Le montage dans `App.jsx` n'est couvert par aucun test Vitest (pas de test d'`App`), seulement par les captures Playwright.
4. `feat(frontend)` : Historique et Clients.
   - Plan validé le 2026-10-05 par Mahamadou :
     - `messageErreur(err, fallback)` dans `errorUtils.js`, pour les erreurs affichées sous un formulaire : sur le refus `ABONNEMENT_EXPIRE`, même signal qu'`alerterErreur` et renvoie `''` ; sinon renvoie `getErrorMessage(...)` sans signal. Les erreurs sous les formulaires ne s'affichent que si le texte n'est pas vide : sur ce refus, rien sous le formulaire (l'erreur précédente de la même vente est effacée), seul le message du haut reste. Jamais deux messages.
     - Endroits : Historique, annulation d'une vente (`alerterErreur`, liste non rechargée) ; Clients, ajout d'un client (`alerterErreur`) ; fiche client, remboursement et correction (`messageErreur`). Inchangés : l'`alert` locale « Le téléphone est obligatoire. » (chantier des `alert`) et le `window.confirm` de l'annulation.
     - Fenêtre déjà ouverte (fiche client, ajout d'un client) : toutes en `z-50` dans `main`, le message et la fenêtre « Renouveler » rendus après `main` passent devant (à mesurer avec `elementFromPoint`). Saisie conservée : la fenêtre d'ajout ne se ferme qu'en cas de succès, montant et mode du remboursement ne sont remis à zéro qu'en cas de succès, le formulaire de correction reste ouvert ; ouvrir puis fermer « Renouveler » ne démonte rien. Employé (remboursement permis, D3) : texte employé, sans bouton.
     - Ancien backend (même texte, sans code) : comportement d'aujourd'hui (`alert` pour l'annulation et l'ajout, erreur sous le formulaire pour le remboursement et la correction). `Clients.test.jsx` (création et remboursement refusés en 403 sans code) restent tels quels comme non-régression ; ajout du même cas pour la correction et l'annulation.
     - Tests, chaque écran rendu avec `RefusAbonnementExpire` : `messageErreur` (unitaires) ; annulation, ajout (puis « Renouveler », fenêtre après la fenêtre d'ajout dans le DOM, saisie intacte après « Fermer »), remboursement (un seul `role="alert"`, aucune erreur sous le formulaire, montant et mode conservés), correction, employé. Dans chaque test de refus, le bouton revient à son état normal (cliquable, plus d'état « en cours »). Vus échouer avant.
     - Mutations : `messageErreur` renvoie le message sur ce refus (deux messages) ; pas de signal ; chacun des 4 endroits remis comme avant ; fenêtre d'ajout fermée sur une erreur ; montant remis à zéro sur une erreur ; état « en cours » laissé bloqué après le refus.
     - Captures Playwright à 375 px et en desktop avec `elementFromPoint` : message au premier plan au-dessus de la fiche client et de la fenêtre d'ajout, « Renouveler » devant elles, saisie relue après fermeture.
   - Fait : `78643c1`, poussé le 2026-10-05 avec les commits doc `0fa1d5c`, `0e1a6c9` et `40e4822`. CI : sur les runs #99 (37369517464, `0fa1d5c`) et #100 (37373059418, `0e1a6c9`), job frontend vert, job backend jamais démarré (« The job was not acquired by Runner of type hosted even after multiple attempts », annulé après 15 min, aucune étape lancée) : incident GitHub, pas un test en échec. Run #101 (37374761684, `40e4822`, qui contient le code du commit 4) **vert**, frontend et backend : le job backend a obtenu une machine après environ 13 min d'attente. Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, date de fin au 04/10/2026, puis remise au 23/10/2026) : remboursement refusé dans la fiche client avec le message rouge en haut, rien enregistré, montant conservé ; « Renouveler » ouvre Mon Abonnement devant la fiche. Non vérifiés en prod (prouvés par les tests et les captures) : annulation dans l'Historique, ajout d'un client, correction, message employé. Preuves : 10 tests (2 unitaires de `messageErreur`, 8 dans `RefusAbonnementExpireHistoriqueClients.test.jsx`), 6 des 8 tests d'écran en échec sur l'ancien code ; 12 mutations détectées, dont 4 « état en cours bloqué » ; lint, build et 227 tests Vitest OK ; captures Playwright à 375 px et en desktop avec `elementFromPoint`.
   - Incident de test (2026-10-05, Boutique 2, prod) : un premier essai avec une date de fin au 06/10/2026 (abonnement encore valide) a réellement enregistré un remboursement de 100 sur V-2F621063, corrigé à 0 par Mahamadou (motif « test », correction chaînée : +100 et −100 dans le journal de caisse du jour), et annulé une vente de test. Leçon : avant un test d'expiration, vérifier que le bandeau orange J-3 a disparu. Plus sûr encore : vérifier que Mon Abonnement affiche « Expiré » (le bandeau est aussi absent pour un abonnement valide à plus de 3 jours de sa fin).
   - Limite connue (relevée sur les captures du 2026-10-05) : à 375 px, le message recouvre la croix de la fiche client tant qu'il n'est pas fermé (constaté quand la fiche a défilé). On le ferme avec sa propre croix.
5+6. `feat(frontend)` : commits 5 et 6 regroupés (décidé le 2026-10-05) : Achats, Fournisseurs (fiche comprise) et les autres écrans (Dépenses, Stock, Produits, Catégories, Unités de vente, Paramètres, Employés, panneau d'Iwi). Une seule raison de changer (même refus, même traitement) ; deux fichiers de tests (« Achats et Fournisseurs », « autres écrans ») pour garder chaque lancement court.
   - Plan validé le 2026-10-05 par Mahamadou (points 1 à 4) :
     - `alerterErreur` : Achats (enregistrement, annulation), Fournisseurs (création ou modification, suppression), Dépenses (création, annulation), Stock (mouvement), Produits (création ou modification, suppression), Catégories (création, suppression), Unités de vente (création ou modification, suppression, suppression forcée), Paramètres (boutique), Employés (création, désactivation, réactivation).
     - `messageErreur` : fiche fournisseur (paiement, correction) ; panneau d'Iwi (le cas 429 reste testé en premier, question conservée).
     - Inchangés : l'`alert` regroupé des prix par unité dans Produits (`Products.jsx`, « le produit a été enregistré, mais certains prix… ») : sur ce refus, l'enregistrement du produit est refusé d'abord et les prix ne sont jamais envoyés ; limite connue : expiration exactement entre deux requêtes, non traitée. Mon Compte (mot de passe, non bloqué par l'expiration). Les `alert` de validation locale (chantier des `alert`). Les `window.confirm`.
     - Fenêtres déjà ouvertes (toutes en `z-50`, rendues avant `RefusAbonnementExpire`) : message et « Renouveler » devant, à mesurer avec `elementFromPoint`.
     - Ancien backend : un test de non-régression par mécanisme (un `alert` : enregistrement d'un achat ; une erreur dans la page : paiement dans la fiche fournisseur ; le panneau d'Iwi), pas par endroit.
     - Tests, vus échouer avant, chaque écran rendu avec `RefusAbonnementExpire` : pour chacun des 21 endroits, message en haut, aucun `alert()`, aucune erreur dans la page (endroits en `messageErreur`), saisie conservée, bouton revenu à son état normal ; « Renouveler » devant la fenêtre produit et devant le panneau d'Iwi, saisie intacte après « Fermer » ; employé (paiement fournisseur).
     - Mutations (environ 40) : chacun des 21 endroits remis comme avant (2 pour la suppression forcée d'une unité) ; « en cours » laissé bloqué sur les 12 endroits qui ont cet état ; saisie perdue sur une erreur (panier d'achat, fenêtre produit, question d'Iwi). Chaque mutation ne lance que le fichier de tests concerné.
     - Captures Playwright à 375 px et en desktop avec `elementFromPoint` : Achats (panier conservé), fiche fournisseur (paiement refusé), fenêtre produit, panneau d'Iwi, Paramètres.
     - Unités de vente et Employés n'ont aucun état « en cours » : la vérification du bouton y est faible (toujours cliquable) ; pas ajouté dans ce commit (chantier séparé, voir « En attente, côté code »).
   - Fait : `9d5a37f`, poussé le 2026-10-13 avec le commit doc `fe635a0`, CI verte (run GitHub Actions 38460777342, succès). Vérifié en prod par Mahamadou le 2026-10-13 (Boutique 2 mise expirée, « Expiré » vérifié d'abord dans Mon Abonnement) : achat refusé avec le message rouge en haut, panier conservé ; paiement dans une fiche fournisseur refusé avec le message en haut, rien sous le formulaire, montant conservé ; date de fin remise au 2026-10-23, une vente normale passe. Non vérifiés en prod (prouvés par les tests et les captures) : les autres endroits, le panneau d'Iwi, le message employé.
     - Code : 18 endroits en `alerterErreur`, 3 en `messageErreur` (fiche fournisseur : paiement et correction ; panneau d'Iwi), 11 fichiers. Inchangés comme prévu : l'`alert` regroupé des prix par unité (`Products.jsx`), Mon Compte, les `alert` de validation locale, les `window.confirm`.
     - Tests : `RefusAbonnementExpireAchatsFournisseurs.test.jsx` (9) et `RefusAbonnementExpireAutresEcrans.test.jsx` (19), chaque écran rendu avec `RefusAbonnementExpire`. Sur l'ancien code, 24 échecs sur 28, tous pour la bonne raison (pas de message en haut, pas de « Renouveler », texte brut dans le panneau d'Iwi) ; les 4 qui passent sont les non-régressions voulues (ancien backend : achat, paiement fournisseur, Iwi ; quota 429).
     - Mutations : 36 sur 36 détectées, chacune par le test de son propre endroit : 21 endroits remis comme avant, 12 « en cours » laissés bloqués, 3 saisies perdues (panier d'achat, fenêtre produit, question d'Iwi).
     - lint, build et 255 tests Vitest OK (config par défaut, comme en CI ; RAM libre 1,9 Go).
     - Captures Playwright à 375 px et en desktop (Achats, fiche fournisseur, fenêtre produit, panneau d'Iwi, Paramètres ; API simulée, toute écriture refusée en 403 `ABONNEMENT_EXPIRE`) : 10 sur 10 conformes. Message au premier plan (`elementFromPoint`), « Renouveler » devant la fenêtre, saisie relue intacte après fermeture, un seul message, aucun `alert()`, une seule écriture envoyée.
     - Limite connue (captures du 2026-10-13) : à 375 px, le message recouvre le haut du formulaire d'achat tant qu'il n'est pas fermé (même limite que la fiche client au commit 4, décision 1). On le ferme avec sa croix.
     - Test instable réglé avant commit : « Achats, enregistrement », alors premier test de son fichier, payait le démarrage (5 lancements : 2405 à 4094 ms pour un délai de 5000 ms ; un dépassement pendant les mutations, sur un lancement où Achats n'était pas muté). Décision de Mahamadou (option 1, sans toucher au délai) : l'annulation d'un achat, test le plus court, passe en premier. Mesure après, 5 lancements sur 5 OK : test le plus lent de chaque lancement entre 2429 et 3160 ms (l'annulation), « enregistrement » entre 1403 et 2303 ms. Machine : RAM libre 1,4 à 1,8 Go sur 7,9, 12 à 14 processus Chrome, CPU au repos.
7. `feat(frontend)` : ventes hors ligne (`ECHEC_ABONNEMENT`, arrêt de la boucle, bandeau).
8. `docs` : `EN_COURS.md`.

Les commits frontend marchent aussi face à l'ancien backend (sans code, `alert` d'aujourd'hui).

- Aujourd'hui (constaté au plan du commit 3 de l'offre unique) : une boutique expirée ne voit le refus qu'après avoir rempli un formulaire, le plus souvent dans un `alert()`, sans lien vers « Mon abonnement » ; `AbonnementBanner` ne s'affiche qu'entre J-3 et J0, tant que l'abonnement est valide.
- Idées à étudier (le bandeau global permanent est écarté par la décision ci-dessus) : un code `ABONNEMENT_EXPIRE` à côté du message de `_verifier_acces` (backend), pour que le frontend reconnaisse ce refus sans lire le texte français (`getErrorCode` est gardé pour ça) ; `abonnement` du `SettingsContext` (gardé pour ça).

## Fonctionnalités réservées au Premium (historique : toutes retirées par l'offre unique, terminée le 2026-10-05)

État au 2026-10-02, gardé pour mémoire : plus rien de ce qui suit n'existe dans le code (`verifier_acces_premium`, `tenants/premium.py`, `a_acces_premium`, `PremiumRequisBanner.jsx`, `CODE_PALIER_INSUFFISANT` et `aAccesPremium` ont été retirés ; la colonne du journal est toujours affichée). Seule la colonne `FormuleAbonnement.palier` reste, sans être lue (décision 3).

Un seul contrôle côté backend, `verifier_acces_premium` (`tenants/premium.py`), qui s'appuie sur `Boutique.a_acces_premium()` (`tenants/models.py`) : abonnement valide et formule de palier `PREMIUM`. Il ne bloque que les écritures ; la lecture reste toujours permise.

| Fonctionnalité | Contrôle backend | Frontend |
|---|---|---|
| Vente à crédit (avec `client_credit`) | `sales/serializers.py` (`VenteSerializer.create`) | `Sales.jsx` : case « Vente à crédit » grisée, bannière |
| Créer un client à crédit | `sales/views.py` (`ClientViewSet.perform_create`) | `Clients.jsx` : bouton « Ajouter un client » grisé, bannière |
| Enregistrer un remboursement client | `sales/views.py` (`RemboursementViewSet.perform_create`) | `Clients.jsx` : formulaire remplacé par la bannière |
| Corriger un remboursement client | `sales/views.py` (`RemboursementViewSet.corriger`) | `Clients.jsx` : bouton « Corriger » masqué |

- `tenants/views.py` expose `a_acces_premium` au frontend, lu par `SettingsContext.jsx` (`aAccesPremium`). Le frontend ne bloque que sur un `false` confirmé.
- `PremiumRequisBanner.jsx` s'affiche sur le code d'erreur `PALIER_INSUFFISANT` (`services/errorUtils.js`).
- `JournalCaisse.jsx` masque la colonne « Remboursements de dettes » hors Premium, sauf s'il y a des montants. C'est de l'affichage, pas un contrôle.

## En attente, côté code (pour plus tard)

- CI (relevé le 2026-10-05, annotation GitHub) : le libellé `ubuntu-latest` passera à Ubuntu 26 à partir du 19 octobre 2026. Surveiller la CI après cette date (versions de Python, de Node et de PostgreSQL de l'image). Constaté le 2026-10-19 : Runner Image `ubuntu-24.04` (20261012.334.1) ; le passage à Ubuntu 26 n'a pas encore eu lieu. Fait le 2026-10-20 : `runs-on: ubuntu-24.04` fixé pour les deux jobs (`160c66e`), CI verte (run 39412654406, les deux jobs sous l'étiquette `ubuntu-24.04`). Reste une tâche à part : le passage à Ubuntu 26.

- Petit défaut (relevé en prod le 2026-10-04) : couleurs des dettes à harmoniser, fournisseurs et clients. Le total de l'écran Fournisseurs est en rouge, alors que le badge « Doit X » peut être vert : `couleurBadgeDette` colore le badge selon l'ancienneté de la plus vieille dette (vert à moins de 7 jours, orange jusqu'à 30, rouge au-delà), c'est voulu, mais la juxtaposition avec le total rouge prête à confusion. « Reste dû 0 » (fiche fournisseur) et « Dû 0 » (fiche client) s'affichent en rouge. Décider d'une règle commune avant de corriger.
- Même défaut que la fiche client avant le commit 3 (relevé le 2026-10-05, par lecture du code, sans y toucher) : dans la fiche fournisseur (`FicheFournisseur.jsx`), un achat annulé a bien son badge « Annulé », mais « Reste dû » affiche toujours `montant_du` en rouge, comme si la dette restait due. À traiter avec le point précédent (couleurs des dettes), sur le modèle de la fiche client.
- Chantier séparé (relevé le 2026-10-03, par lecture du code, non reproduit) : réponses anciennes qui écrasent les plus récentes. Aucun rechargement n'ignore une réponse périmée (ni annulation, ni numéro de requête) : `fetchDettes` (`Suppliers.jsx`), `chargerHistorique` (`FicheFournisseur.jsx`), `fetchClients` et l'historique de `FicheClient` (`Clients.jsx`), et le total du 8 ter. Deux paiements rapides sur deux achats de la fiche fournisseur lancent deux rechargements ; si le premier répond en dernier, badges et historique montrent un état sans le second paiement, jusqu'au prochain rechargement. Plus gênant : en vue support, changer vite de boutique pourrait afficher un instant les dettes de la boutique précédente (affichage seulement, l'API reste isolée). Piste : ignorer toute réponse qui n'est pas celle de la dernière requête.
- Réglé par l'offre unique (2026-10-05) : une boutique redescendue du Premium ne pouvait plus enregistrer les remboursements de ses clients (`RemboursementViewSet.perform_create`), ce qui faussait sa caisse. Depuis `1ae07bd` et `6b7e1a7`, seul un abonnement valide est exigé.
- Chantier séparé : objets d'une autre boutique qui renvoient autre chose qu'un 404 identique à celui d'un objet inexistant (règle de `CLAUDE.md`, Sécurité). `RemboursementViewSet.perform_create` renvoie 403 (« Cette vente n'appartient pas à votre boutique », `sales/views.py`). Même problème relevé ailleurs, à inventorier : `products/views.py` (403 sur produit et unité), et des serializers qui répondent 400 « n'appartient pas à votre boutique », message différent de celui d'un id inexistant (`sales`, `purchases` dont `validate_fournisseur`, `inventory`, `products`). Modèle à suivre : `AchatDeLaBoutiqueField` (`purchases/serializers.py`).
- Petit défaut (relevé en prod le 2026-10-05, sans y toucher) : dans l'Historique des ventes, le refus d'annulation s'affiche dans un `alert()` du navigateur (« iwishop.vercel.app indique », `SalesHistory.jsx:95`), alors que le reste de l'app affiche les erreurs dans la page. Pas un cas isolé : 44 appels à `alert(` dans 13 fichiers du frontend (compte par grep, non examinés un par un). Décider d'une règle avant de corriger.
- Relevés par l'analyse de l'offre unique (2026-10-05), hors de ce chantier, à décider plus tard :
  - « Pas d'abonnement = accès autorisé » (`abonnement_valide()` vrai sans `Abonnement`) est un trou potentiel : seule la boutique d'administration (id 1) est dans ce cas aujourd'hui.
  - Aucun bandeau après l'expiration : `AbonnementBanner` ne s'affiche qu'entre J-3 et J0, tant que l'abonnement est valide. Devenu le chantier en cours (voir plus haut).
  - L'assistant répond après l'expiration (aucun contrôle d'abonnement dans `AssistantView`) : coût en tokens Anthropic, seul le quota quotidien limite. Pris dans le chantier en cours (commit 2, décision 4).
  - `NotificationViewSet.marquer_lue` est une écriture non contrôlée par `_verifier_acces`.
  - Réglé le 2026-10-05 (dans l'admin, pas dans le code) : « Essai gratuit » était en `actif=True` en prod avec un prix de 3 000 (créée à 0 et `actif=False` par la migration 0006), donc en vente sur « Mon abonnement » : un client pouvait racheter 14 jours à répétition. Mahamadou l'avait activée en pensant que « Actif » voulait dire « l'essai fonctionne ». Repassée à `actif=False` par Mahamadou : l'essai reste donné à l'inscription (`ApprouverDemandeView` ne filtre pas sur `actif`, prouvé par `EssaiGratuitApprouverDemandeTests`, qui tourne avec la formule de la migration en `actif=False`) et elle n'est plus en vente (`FormuleAbonnementListView` et `CreerPaiementView` exigent `actif=True`). Le prix de 3 000 n'a plus d'effet. Ne pas la renommer.
- Réglé le 2026-10-20 : `creer-paiement/` sans contrôle de rôle (relevé le 2026-10-05). Voir « Chantier sécurité : paiement de l'abonnement (2026-10-20) ».
- Chantier séparé (relevé le 2026-10-20, point C) : `CreerPaiementView` ne vérifie pas `boutique.actif`. Une boutique désactivée ne doit pas pouvoir payer (son abonnement serait prolongé alors qu'elle reste désactivée). Sans effet tant que le paiement en ligne est fermé.
- Chantier séparé (relevé le 2026-10-20, point D) : aucune limite de débit sur `creer-paiement/` (pas de `DEFAULT_THROTTLE_CLASSES`). Risque : des factures PayDunya en masse sur notre compte marchand (la réutilisation sur 15 minutes ne vaut que par boutique et par formule). À régler avant d'ouvrir le paiement en ligne.
- Plus tard (décidé par Mahamadou le 2026-10-21) : commit de nettoyage `test(accounts)`, remplacer les adresses réelles (et `1.2.3.4`) par des adresses de documentation RFC 5737 (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) dans `accounts/throttling.py` (docstring de `_ip_client`) et `accounts/tests.py` (`IpClientResolutionTests`). Ces adresses viennent de la mesure de septembre (`bf49d58`). On ne réécrit pas l'historique (IP dynamique, pas un secret). `DiagXffTemporaireTests` utilise déjà des adresses RFC 5737, sauf `1.2.3.4`, et disparaît avec le journal `DIAG_XFF`.
- Plus tard (décidé par Mahamadou le 2026-10-20) : une adresse de contact pro (par exemple `contact@iwishop.app`, après l'achat du domaine) dans le texte « contactez-nous », lue depuis une variable d'environnement, jamais écrite dans le code.
- Cas limites relevés le 2026-10-20, déjà présents (ils touchent tous les écrans qui lisent `est_proprietaire`, pas seulement Mon Abonnement) :
  - Boutique active enregistrée devenue inaccessible au compte : `me/` part avec l'ancien `X-Boutique-Active`, `boutique_de` refuse, `est_proprietaire` vaut faux. `BoutiqueActiveProvider` corrige l'id sans recharger : un propriétaire est vu comme employé jusqu'au rechargement suivant (le serveur, lui, l'accepte). Piste : recharger `me/`, ou la page, après cette correction.
  - Premier chargement sans boutique enregistrée : le serveur prend la première boutique **active** (`profil_par_defaut`), le frontend la première de `mes-boutiques/`. Ils ne diffèrent que si la première boutique du compte est désactivée.
- Chantier séparé : « Essai gratuit » est trouvée par son nom exact (`FormuleAbonnement.objects.get(nom='Essai gratuit')`, `ApprouverDemandeView`), ce qui est fragile : la renommer dans l'admin bloque toute nouvelle inscription. La remplacer par un identifiant stable. Relevé par Mahamadou le 2026-10-22 : `actif=False`, 14 jours, prix passé de 3 000 à 0, nom inchangé.
- Tâche à part (décidée par Mahamadou le 2026-10-22) : faire tourner `verifier_dettes_en_retard` en prod. La commande existe (`notifications/management/commands/`), mais rien ne la lance (ni `build.sh`, ni une tâche planifiée) : les notifications « dette en retard » ne sont probablement jamais créées en prod. Retirée de la landing en attendant.
- Relevés le 2026-10-22 (commit `cb187e3`), rien n'est corrigé :
  - `Login.jsx`, emails qui tutoyaient, « 14 jours » de `DemandeAccesPage` : faits le 2026-10-23 (voir « Lot du 2026-10-23 »). La landing garde « 14 jours » en dur (décision de Mahamadou) : à changer à la main si la durée de l'essai change.
- Chantier séparé : `Clients.jsx` : le corps de la carte de vente (~200 lignes dans le map) est à extraire en composant `CarteVente`, avec ses tests inchangés.
- Chantier séparé : `Clients.jsx:55` (`grouperRemboursements`) calcule le montant effectif d'un remboursement côté frontend, en flottants avec arrondi, contrairement à `CLAUDE.md` (aucun calcul de montant dans le frontend). Le faire calculer par le backend, comme `montant_effectif` dans l'historique fournisseur.
- Chantier séparé : autres calculs de montants existants dans le frontend. `Purchases.jsx` (sous-totaux et « Montant Total » du panier) et `Sales.jsx` (« Restera dû » calculé pendant la saisie d'une vente à crédit). Nuance : un total provisoire pendant la saisie est acceptable si le serveur recalcule la valeur enregistrée ; le chantier vérifiera au cas par cas.
- Test instable à surveiller (relevé le 2026-10-03) : `PurchasesAchatACredit.test.jsx`, « achat comptant : mode obligatoire sans valeur par défaut, puis envoyé sans `montant_paye` » (ajouté par le 7 bis), a dépassé le délai dans la suite complète : 5117 ms pour 5000 ms. Suite de 399 s ; machine : 0,8 Go de RAM libre sur 7,9 Go, Chrome ouvert (19 processus), CPU au repos au moment du relevé. Le même jour, seul et 10 fois de suite dans le même état : 1220 à 1852 ms (médiane 1368 ms), 10 sur 10 OK. CI verte. Cause probable (avis de Mahamadou) : la mémoire de la machine (0,8 Go libre) ; Mahamadou fermera Chrome pendant les suites complètes. À surveiller : s'il échoue à nouveau, la méthode de `Clients.test.jsx` (20 passages sous charge). Pas d'augmentation de délai sans accord. Deuxième cas le même jour : `SubmissionStates.test.jsx`, « protège la validation d'une vente pendant une requête en cours », 5035 ms pour 5000 dans la suite complète (1,9 Go de RAM libre, Chrome ouvert, 16 processus) ; seul, 5 fois : 1239 à 2377 ms, 5 sur 5 OK. Même tableau : la piste de la mémoire se renforce.
- Constat (2026-10-03) : deux tests différents dépassent 5 s dans la suite complète sur la machine de Mahamadou, alors qu'ils passent seuls. Piste à mesurer après le 8 bis : limiter le nombre de workers Vitest en local, sans toucher aux délais.
- Constat (2026-10-13) : les workers Vitest ne démarraient pas (« Timeout waiting for worker to respond », avant tout test, même sur `errorUtils.test.js`), environ 6 fois de suite, en `forks` comme en `threads`, même avec `--maxWorkers=1` ; puis de nouveau normal sans aucun changement. RAM libre 1,1 à 1,3 Go, environ 13 processus Chrome. À rattacher à la piste précédente.
- Constat (2026-10-21, pendant le commit 2 du chantier « nom de domaine ») : de nouveau « Failed to start forks worker » et « Timeout waiting for worker to respond » vers 20 h 25 à 20 h 33 UTC, même sur `errorUtils.test.js` et même avec `--pool=threads`. Chrome ouvert (21 processus), 1,3 Go de RAM libre sur 7,9, processeur à 0 %. Chrome fermé (2,1 à 2,5 Go libres) : le worker démarre, suite complète 380 sur 380 en 345 s. Aucun délai ni aucune configuration de Vitest modifiés. Renforce la piste de la mémoire.
- Chantier séparé : messages et exports du backend qui affichent un montant brut (`100.00 FCFA`) au lieu du rendu de l'app. Passer par `formater_montant` (`parametres/services.py`, même rendu que `formatCurrency`) : avertissement de plafond (`sales/services/credit.py`, `avertissement_plafond_credit`), notification de dette (`notifications/services.py`), export PDF du résumé financier et des ventes détaillées (`reports/views.py`, format `:.2f`). Les exports Excel (`#,##0.00` dans `reports/views.py`) sont des formats de cellule numériques : à examiner à part.
- `date_annulation` sur Vente/Achat/Dépense, avant toute vraie clôture de caisse (voir `reports/caisse.py`).
- Export PDF/Excel du journal de caisse.
- Montants JSON en float à migrer en chaînes : tous les rapports ensemble, jamais un par un.
- `/api/health/` qui renvoie `RENDER_GIT_COMMIT`, pour vérifier quel commit tourne sur Render.
- Vérifier `create_superuser_auto` : mot de passe en variable d'environnement, commande idempotente.
- Chantier séparé (relevé le 2026-10-05) : Unités de vente et Employés n'ont aucun état « en cours » (risque de double envoi).
- Sentry.
- Plus tard, seulement si des clients le demandent (décidé le 2026-10-16) : mode « session hors ligne », pour ouvrir ou recharger l'app sans réseau et vendre (voir « Correction de l'isolation hors ligne »).
- Plus tard (relevé le 2026-10-16) : logos non compressés (jusqu'à 1,59 Mo vus dans `iwishop-media`), dans un dossier `logos/` commun à toutes les boutiques. Même traitement possible que la photo de produit ; attention, une facture garde le chemin de son logo (ne jamais supprimer un ancien logo utilisé par une facture).
- Test instable à suivre (relevé le 2026-10-16) : `NotificationBell.test.jsx`, « ouvre le panneau et liste les notifications au clic sur la cloche ». Une fois en échec après 148 s pendant la suite complète (2,6 Go de RAM libre au départ) ; seul, 761 à 1 214 ms (3 passages, 2,1 Go libres, 17 processus Chrome, processeur à 0 %) ; dans d'autres suites complètes, 741 ms, 1 459 ms et 3 015 ms sur 5 000. Ni le composant ni son test n'étaient modifiés. Délai inchangé.
- Test instable à suivre (relevé le 2026-10-19, pendant le 5 bis) : `isolationHorsLigne.test.js`, `beforeEach` du premier test (« le catalogue de (X, boutique 1) n’est rendu ni à (X, boutique 2) ni à (Y, boutique 1) »), « Hook timed out in 10000ms », une fois, fichier lancé seul juste après un échec de démarrage du worker de Vitest (« Timeout waiting for worker to respond », déjà connu sur cette machine). Ce `beforeEach` recharge les modules (`vi.resetModules()` puis imports dynamiques) : le premier test paie les imports à froid. Le `beforeEach` n'était pas modifié (le 5 bis n'a ajouté que des tests). Passage suivant, juste après : 25 tests sur 25 en 18 s pour ce fichier et `deconnexion.test.js` (1,3 Go de RAM libre sur 7,9, 11 processus Chrome, processeur à 0 %, état relevé à ce passage, pas au moment de l'échec) ; suite complète ensuite : 332 sur 332 en 387 s (1,5 Go libres au départ). Délai inchangé.
- Test instable à suivre (relevé le 2026-10-19, pendant le commit 1 du chantier « nom de domaine ») : `urlApi.test.js`, les deux tests de « branchement sur import.meta.env » ont échoué une fois (requêtes en trop dans la liste lue sur le réseau simulé), fichier lancé seul, passage de 101 s juste après un échec de démarrage du worker de Vitest, PC chargé. Sortie complète non gardée. Cause probable, non prouvée : l'import à froid d'`api.js` (après `vi.resetModules()`) dépassait le délai de 5 s du premier test, dont l'import se terminait ensuite pendant le second, avec la variable du second. Même famille que le cas d'`isolationHorsLigne.test.js` ci-dessus. Mesuré : premier test de 410 à 1 554 ms sur 5 000 sans import préalable ; 21 passages réussis ensuite (RAM libre 1,5 Go, 20 processus Chrome). Correctif, sans toucher au délai : `api.js` importé une fois au chargement du fichier, hors de tout test (commentaire dans le test) ; premier test ensuite de 11 à 34 ms, 8 passages sur 8. Puis 4 suites complètes de suite : 357 sur 357 chaque fois, en 218 à 254 s (RAM libre 2,0 à 2,4 Go au départ, 19 processus Chrome, aucun échec de démarrage du worker). Délai inchangé.
- Tâche à part, plus tard (décidé par Mahamadou le 2026-10-20) : trois tests instables de la même famille, `NotificationBell.test.jsx` (2026-10-16), `isolationHorsLigne.test.js` et `urlApi.test.js` (2026-10-19), voir ci-dessus. Même cause probable (avis de Mahamadou, non prouvée) : import à froid lent, souvent juste après un échec de démarrage du worker de Vitest, sur un PC chargé. Nuance pour `NotificationBell.test.jsx` : sa note du 2026-10-16 ne relève ni import à froid ni échec de démarrage du worker (échec pendant une suite complète) ; le lien avec les deux autres est donc une hypothèse plus faible pour ce test-là. Chercher la cause commune (configuration de Vitest, pool de workers, mémoire) plutôt que corriger chaque test ; voir aussi les constats du 2026-10-03 et du 2026-10-13 sur les workers. Rien n'est changé pour l'instant.
- Plus tard (relevé par Mahamadou le 2026-10-19, pendant le test de la livraison B) : avertissement quand la monnaie à rendre est très élevée (vente #51 : 699 999 payés pour 80 000). Seuil et forme à décider. À savoir : l'API enregistre `monnaie_rendue`, mais l'écran Ventes calcule lui-même la monnaie affichée avant validation (`Sales.jsx`, « Monnaie à rendre »), un écart déjà présent avec la règle « aucun calcul de montant » de `CLAUDE.md`.
- Plus tard (relevé le 2026-10-15) : historique des ventes en cartes sur téléphone. Le tableau défile déjà horizontalement (900 px minimum) ; le 4 bis de la facture ne fait que raccourcir la colonne Actions.

## En attente, côté Mahamadou

- Vérifier en prod Ctrl+P et l'état vide du journal de caisse.
- Changer l'ancien mot de passe PostgreSQL local.
- Vérifier que la ligne `postgresql://` est supprimée de l'historique PowerShell.
- Plans payants, décidés le 2026-10-21 : service web Render en plan payant dans la liste « prêt à vendre », Vercel Pro après le premier client (voir « Prochaines étapes »).
- Compte marchand PayDunya : NIF et papiers, avant le premier paiement en ligne d'un client (voir « Ouvrir un jour le paiement en ligne »).
- Début septembre 2027 : vérifier que la carte a assez d'argent pour le renouvellement de `iwishop.app` (14,20 $, prélèvement prévu le 2027-09-21 ; un domaine expiré met toute l'app hors ligne).
- Render → Billing : relever la date du prochain paiement de la base `iwishop-db`, et vérifier que la carte aura assez d'argent à cette date (une base suspendue met toute l'app hors ligne, comme du 2026-10-10 au 2026-10-13).
