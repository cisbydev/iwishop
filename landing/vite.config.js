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
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
});
