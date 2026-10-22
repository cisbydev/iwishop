// Contrôles du site construit (dist/). Lancer `npm run build` avant
// `npm test` : la CI fait de même.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SITE, VALEURS_UNIQUES } from '../site.config.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RACINE, 'dist');

const PAGES = ['index.html'];

function lirePage(nom) {
  const chemin = join(DIST, nom);
  assert.ok(existsSync(chemin), `${nom} absent de dist/ : lancer npm run build`);
  return readFileSync(chemin, 'utf-8');
}

function attributs(html, balise, attribut) {
  const motif = new RegExp(`<${balise}\\b[^>]*\\s${attribut}="([^"]*)"`, 'g');
  return [...html.matchAll(motif)].map((m) => m[1].replaceAll('&amp;', '&'));
}

test('aucune clé {{…}} ne reste dans les pages construites', () => {
  for (const page of PAGES) {
    assert.doesNotMatch(lirePage(page), /\{\{|\}\}/, page);
  }
});

test("les liens vers l'app et WhatsApp sont exactement ceux de la configuration", () => {
  const permis = new Set([SITE.urlConnexion, SITE.urlDemandeAcces, SITE.urlWhatsApp]);
  for (const page of PAGES) {
    const liens = attributs(lirePage(page), 'a', 'href');
    const externes = liens.filter((href) => /gestion\.iwishop\.app|wa\.me/.test(href));
    assert.ok(externes.length > 0, `${page} : aucun lien vers l'app`);
    for (const href of externes) {
      assert.ok(permis.has(href), `${page} : lien inattendu ${href}`);
    }
  }
  assert.ok(attributs(lirePage('index.html'), 'a', 'href').includes(SITE.urlConnexion));
  assert.ok(attributs(lirePage('index.html'), 'a', 'href').includes(SITE.urlDemandeAcces));
});

test('liens et contacts écrits seulement dans site.config.js', () => {
  const sources = readdirSync(RACINE, { recursive: true })
    .map(String)
    .filter((f) => /\.(html|css|js|mjs|json)$/.test(f))
    .filter((f) => !/^(node_modules|dist)[\\/]/.test(f) && f !== 'package-lock.json')
    .filter((f) => !f.endsWith('site.config.js') && !f.endsWith('site.test.mjs'));
  assert.ok(sources.includes('index.html'));
  for (const fichier of sources) {
    const contenu = readFileSync(join(RACINE, fichier), 'utf-8');
    for (const valeur of VALEURS_UNIQUES) {
      assert.ok(!contenu.includes(valeur), `${fichier} contient « ${valeur} » : passer par {{…}}`);
    }
  }
});

test('aucun JavaScript ni style en ligne dans les pages (CSP stricte)', () => {
  for (const page of PAGES) {
    const html = lirePage(page);
    assert.doesNotMatch(html, /<script\b/i, `${page} : <script>`);
    assert.doesNotMatch(html, /\sstyle="/i, `${page} : attribut style`);
    assert.doesNotMatch(html, /<style\b/i, `${page} : <style>`);
  }
});

// Texte lu par le visiteur ou les moteurs : balises retirées, adresses
// (href, src, srcset) retirées, entités courantes décodées.
function texteVisible(html) {
  return html
    .replace(/\s(href|src|srcset)="[^"]*"/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ');
}

test('la marque s\'écrit « iwiShop » partout', () => {
  for (const page of PAGES) {
    const html = lirePage(page);
    // Les attributs (aria-label, alt, content) comptent aussi.
    const sansAdresses = html.replace(/\s(href|src|srcset)="[^"]*"/g, '').replaceAll('iwishop.app', '');
    const graphies = sansAdresses.match(/iwi\s?shop/gi) ?? [];
    assert.ok(graphies.length > 0, `${page} : marque absente`);
    for (const graphie of graphies) {
      assert.equal(graphie, 'iwiShop', `${page} : graphie « ${graphie} »`);
    }
  }
});

test('chaque ancre interne mène à un identifiant de la page', () => {
  for (const page of PAGES) {
    const html = lirePage(page);
    const ids = new Set(attributs(html, '[a-z0-9]+', 'id'));
    for (const href of attributs(html, 'a', 'href').filter((h) => h.startsWith('#'))) {
      assert.ok(ids.has(href.slice(1)), `${page} : ancre ${href} sans cible`);
    }
  }
});

test("les chiffres de l'accroche sont marqués comme des exemples", () => {
  const html = lirePage('index.html');
  const accroche = html.match(/<section class="accroche"[\s\S]*?<\/section>/)?.[0] ?? '';
  const figures = accroche.match(/<figure\b[\s\S]*?<\/figure>/g) ?? [];
  assert.equal(figures.length, 2, 'aperçu et carte Iwi attendus');
  for (const figure of figures) {
    assert.match(figure, /class="etiquette-exemple">Exemple</, 'badge « Exemple » manquant');
  }
  // Aucun montant hors de ces deux cartes dans l'accroche.
  const horsFigures = accroche.replace(/<figure\b[\s\S]*?<\/figure>/g, '');
  assert.doesNotMatch(horsFigures, /FCFA/);
});

// Ce que l'app ne fait pas (relu dans le code le 2026-10-22) : jamais
// promis sur la landing.
const PROMESSES_INTERDITES = [
  [/paiement en ligne|payez en ligne/i, 'paiement en ligne (fermé)'],
  [/accès immédiat|immédiatement/i, 'accès immédiat (validation à la main)'],
  [/rappels? (de|des) dettes?|dettes? en retard/i, 'rappels de dettes (non planifiés en prod)'],
  [/sauvegardes? automatiques?/i, 'sauvegardes automatiques (pas encore faites)'],
  [/code[- ]barres?|scanner/i, 'code-barres'],
  [/\bSMS\b/, 'SMS'],
  [/témoignages?|nos clients|\+\s?\d+ boutiques/i, 'clients ou témoignages (aucun client)'],
  [/illimité/i, 'illimité (non vérifié)'],
  [/sécurisé/i, '« sécurisé » (sans sauvegardes automatiques)'],
  [/traçab/i, 'annulations traçables (auteur non enregistré)'],
  [/vue (globale|consolidée|regroupée)|toutes vos boutiques en un/i, 'vue regroupée des boutiques'],
];

test("aucune promesse que l'app ne tient pas", () => {
  for (const page of PAGES) {
    const texte = texteVisible(lirePage(page));
    for (const [motif, raison] of PROMESSES_INTERDITES) {
      assert.doesNotMatch(texte, motif, `${page} : ${raison}`);
    }
  }
});

const KO = 1024;

function tailleDist(chemin) {
  const fichier = join(DIST, chemin.replace(/^\//, ''));
  assert.ok(existsSync(fichier), `${chemin} absent de dist/`);
  return readFileSync(fichier).length;
}

function balises(html, nom) {
  return html.match(new RegExp(`<${nom}\\b[^>]*>`, 'g')) ?? [];
}

function attribut(balise, nom) {
  return balise.match(new RegExp(`\\s${nom}="([^"]*)"`))?.[1];
}

test('chaque image a alt, largeur et hauteur ; hors logo, chargement différé', () => {
  for (const page of PAGES) {
    // La CSP (img-src 'self') bloque toute image intégrée en data:.
    assert.doesNotMatch(lirePage(page), /data:image/, `${page} : image en data:`);
    for (const img of balises(lirePage(page), 'img')) {
      assert.notEqual(attribut(img, 'alt'), undefined, `alt manquant : ${img}`);
      assert.ok(attribut(img, 'width') && attribut(img, 'height'), `taille manquante : ${img}`);
      if (!/class="marque__logo"/.test(img)) {
        assert.equal(attribut(img, 'loading'), 'lazy', `chargement différé manquant : ${img}`);
      }
    }
  }
});

test('budget de poids pour les réseaux lents', () => {
  const html = lirePage('index.html');
  const css = attributs(html, 'link', 'href').filter((h) => h.endsWith('.css'));
  const base = tailleDist('index.html') + css.reduce((t, h) => t + tailleDist(h), 0);
  let premierAffichage = base;
  let pageEntiere = base;
  for (const img of balises(html, 'img')) {
    // Pire cas : la plus grande variante de srcset.
    const candidats = [attribut(img, 'src'), ...(attribut(img, 'srcset') ?? '').split(',').map((c) => c.trim().split(' ')[0])]
      .filter(Boolean);
    const tailles = candidats.map(tailleDist);
    tailles.forEach((t, i) => assert.ok(t <= 60 * KO, `${candidats[i]} : ${Math.round(t / KO)} Ko > 60 Ko`));
    const plusGrande = Math.max(...tailles);
    pageEntiere += plusGrande;
    if (attribut(img, 'loading') !== 'lazy') premierAffichage += plusGrande;
  }
  assert.ok(premierAffichage <= 150 * KO, `premier affichage : ${Math.round(premierAffichage / KO)} Ko`);
  assert.ok(pageEntiere <= 500 * KO, `page entière : ${Math.round(pageEntiere / KO)} Ko`);
});

function meta(html, propriete) {
  return html.match(new RegExp(`<meta\\s+(?:property|name)="${propriete}"\\s+content="([^"]*)"`))?.[1];
}

test('aperçu de partage (WhatsApp, Facebook) : balises et image 1200 x 630', () => {
  const html = lirePage('index.html');
  for (const propriete of ['og:title', 'og:description', 'og:type', 'og:locale', 'twitter:card']) {
    assert.ok(meta(html, propriete), `${propriete} manquant`);
  }
  assert.equal(meta(html, 'og:url'), `${SITE.urlSite}/`);
  const image = meta(html, 'og:image');
  assert.equal(image, `${SITE.urlSite}/og-image.png`, 'adresse complète en https attendue');
  const png = readFileSync(join(DIST, 'og-image.png'));
  assert.equal(png.toString('ascii', 12, 16), 'IHDR', 'og-image.png doit être un PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length <= 300 * KO, `og-image.png : ${Math.round(png.length / KO)} Ko (WhatsApp : 300 Ko au plus)`);
});

test('icônes : favicon.ico et apple-touch-icon servis', () => {
  const liens = attributs(lirePage('index.html'), 'link', 'href');
  for (const icone of ['/favicon.ico', '/apple-touch-icon.png']) {
    assert.ok(liens.includes(icone), `${icone} non déclaré`);
    assert.ok(tailleDist(icone) > 0);
  }
});

test('titre, description et adresse canonique', () => {
  const html = lirePage('index.html');
  const titre = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  assert.ok(titre.length > 0 && titre.length <= 60, `titre de ${titre.length} caractères`);
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? '';
  assert.ok(description.length >= 50 && description.length <= 160, `description de ${description.length} caractères`);
  assert.ok(attributs(html, 'link', 'href').includes(`${SITE.urlSite}/`), 'adresse canonique absente');
});
