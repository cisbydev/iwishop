import { useState } from 'react';
import { Package } from 'lucide-react';

// Photo d'un produit, ou une image par défaut quand il n'y en a pas (champ
// absent : backend pas encore déployé) ou qu'elle ne se charge pas (URL
// signée expirée, réseau). `src` est l'URL renvoyée par l'API, ou l'aperçu
// local d'une photo choisie.
export default function PhotoProduit({ src, nom, className = '' }) {
  // URL en échec, et non un simple booléen : une nouvelle URL est retentée.
  const [urlEnEchec, setUrlEnEchec] = useState(null);

  if (!src || src === urlEnEchec) {
    return (
      <span
        role="img"
        aria-label={`Pas de photo pour ${nom}`}
        className={`flex shrink-0 items-center justify-center bg-slate-100 text-slate-400 ring-1 ring-slate-200 ${className}`}
      >
        <Package className="h-1/2 w-1/2" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`Photo de ${nom}`}
      onError={() => setUrlEnEchec(src)}
      className={`shrink-0 object-cover ring-1 ring-slate-200 ${className}`}
    />
  );
}
