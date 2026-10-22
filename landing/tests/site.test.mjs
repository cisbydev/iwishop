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

test('titre, description et adresse canonique', () => {
  const html = lirePage('index.html');
  const titre = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  assert.ok(titre.length > 0 && titre.length <= 60, `titre de ${titre.length} caractères`);
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? '';
  assert.ok(description.length >= 50 && description.length <= 160, `description de ${description.length} caractères`);
  assert.ok(attributs(html, 'link', 'href').includes(`${SITE.urlSite}/`), 'adresse canonique absente');
});
