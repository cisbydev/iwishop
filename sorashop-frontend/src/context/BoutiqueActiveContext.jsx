import { useCallback, useEffect, useState } from 'react';
import { listerMesBoutiques } from '../services/boutiques';
import { getBoutiqueActiveId, setBoutiqueActiveId } from '../services/boutiqueActiveState';
import { BoutiqueActiveContext } from './boutiqueActiveContextValue';

export function BoutiqueActiveProvider({ children }) {
  const [boutiques, setBoutiques] = useState([]);
  const [boutiqueActiveId, setBoutiqueActiveIdEtat] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const resultats = await listerMesBoutiques();
        if (!active) return;
        setBoutiques(resultats);

        // Restaure la valeur déjà stockée si elle fait toujours partie des
        // boutiques accessibles, sinon retombe sur la première - même
        // priorité que le fallback backend de boutique_de().
        const stockee = getBoutiqueActiveId();
        const estValide = stockee != null && resultats.some((b) => String(b.id) === String(stockee));
        const idAUtiliser = estValide ? Number(stockee) : resultats[0]?.id ?? null;

        if (idAUtiliser != null) {
          setBoutiqueActiveId(idAUtiliser);
        }
        setBoutiqueActiveIdEtat(idAUtiliser);
      } catch (err) {
        console.error('Erreur chargement des boutiques accessibles', err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const changerBoutique = useCallback((id) => {
    setBoutiqueActiveId(id);
    setBoutiqueActiveIdEtat(id);
    // Recharge l'app avec la nouvelle boutique active - comme un
    // changement d'onglet, pas une déconnexion/reconnexion : le token
    // d'accès vit en mémoire (cf. api.js) mais un rechargement de page le
    // récupère déjà silencieusement via le cookie de refresh.
    window.location.reload();
  }, []);

  return (
    <BoutiqueActiveContext.Provider value={{
      boutiques,
      boutiqueActiveId,
      loading,
      changerBoutique,
    }}>
      {children}
    </BoutiqueActiveContext.Provider>
  );
}
