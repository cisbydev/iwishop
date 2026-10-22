import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { SITE } from './site.config.js';

const echapperHtml = (texte) => texte.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

// Remplace {{cle}} par la valeur de SITE dans chaque page. Une clé inconnue
// fait échouer le build : jamais de lien vide ou de {{…}} en ligne.
function configurationDuSite() {
  return {
    name: 'configuration-du-site',
    transformIndexHtml(html) {
      return html.replace(/\{\{(\w+)\}\}/g, (_, cle) => {
        if (!(cle in SITE)) throw new Error(`Clé inconnue dans une page : {{${cle}}}`);
        return echapperHtml(SITE[cle]);
      });
    },
  };
}

export default defineConfig({
  plugins: [configurationDuSite()],
  build: {
    // Jamais d'image intégrée en data: : la CSP (img-src 'self') la bloquerait.
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        mentions: resolve(import.meta.dirname, 'mentions-legales.html'),
        confidentialite: resolve(import.meta.dirname, 'confidentialite.html'),
      },
    },
  },
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
});
