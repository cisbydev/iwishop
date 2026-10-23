import { useState, useSyncExternalStore } from 'react';
import { Package } from 'lucide-react';

function suivreConnexion(rappel) {
  window.addEventListener('online', rappel);
  window.addEventListener('offline', rappel);
  return () => {
    window.removeEventListener('online', rappel);
    window.removeEventListener('offline', rappel);
  };
}

const estEnLigne = () => navigator.onLine !== false;

// Photo d'un produit, ou une image par défaut quand il n'y en a pas (champ
// absent : backend pas encore déployé), qu'elle ne se charge pas (URL
// signée expirée, réseau) ou que l'appareil est hors ligne (D7 : aucune
// photo mise en cache en phase 1). `src` est l'URL renvoyée par l'API, ou
// l'aperçu local (blob:) d'une photo choisie, affiché même hors ligne.
// Sert aussi à l'image d'une catégorie : `Icone` et les deux textes
// changent, les quatre cas de l'image par défaut restent les mêmes.
export default function PhotoProduit({
  src,
  nom,
  className = '',
  Icone = Package,
  texteAbsente = `Pas de photo pour ${nom}`,
  texteImage = `Photo de ${nom}`,
}) {
  // URL en échec, et non un simple booléen : une nouvelle URL est retentée.
  const [urlEnEchec, setUrlEnEchec] = useState(null);
  const enLigne = useSyncExternalStore(suivreConnexion, estEnLigne, () => true);
  const horsLigne = !enLigne && !src?.startsWith('blob:');

  if (!src || src === urlEnEchec || horsLigne) {
    return (
      <span
        role="img"
        aria-label={texteAbsente}
        className={`flex shrink-0 items-center justify-center bg-slate-100 text-slate-400 ring-1 ring-slate-200 ${className}`}
      >
        <Icone className="h-1/2 w-1/2" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={texteImage}
      loading="lazy"
      onError={() => setUrlEnEchec(src)}
      className={`shrink-0 object-cover ring-1 ring-slate-200 ${className}`}
    />
  );
}
