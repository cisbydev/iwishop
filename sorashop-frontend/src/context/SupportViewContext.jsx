import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { setSupportBoutiqueId } from '../services/supportViewState';

const SupportViewContext = createContext(null);

export function SupportViewProvider({ children }) {
  // null = pas de session Vue Support en cours (comportement normal)
  const [session, setSession] = useState(null);
  const location = useLocation();

  const demarrer = useCallback(async (boutiqueId, boutiqueNom) => {
    await api.post(`tenants/boutiques/${boutiqueId}/vue-support/`);
    // Mise à jour synchrone du singleton AVANT le setState React, pour que
    // toute requête déclenchée juste après (ex: navigation immédiate) porte
    // déjà le header, sans attendre un cycle de rendu.
    setSupportBoutiqueId(boutiqueId);
    setSession({ boutiqueId, boutiqueNom });
  }, []);

  const quitter = useCallback(() => {
    setSupportBoutiqueId(null);
    setSession(null);
  }, []);

  // Filet de sécurité : si jamais le composant qui a démarré la session
  // disparaît sans passer par quitter(), on ne veut jamais qu'un header
  // orphelin traîne sur des requêtes futures hors contexte.
  useEffect(() => {
    setSupportBoutiqueId(session?.boutiqueId ?? null);
  }, [session]);

  // Retour sur l'espace d'administration plateforme = fin de la session
  // de consultation, qu'on soit passé par le bouton "Quitter" ou non.
  useEffect(() => {
    if (session && location.pathname.startsWith('/admin-plateforme')) {
      quitter();
    }
  }, [location.pathname, session, quitter]);

  return (
    <SupportViewContext.Provider value={{
      actif: !!session,
      boutiqueId: session?.boutiqueId ?? null,
      boutiqueNom: session?.boutiqueNom ?? null,
      demarrer,
      quitter,
    }}>
      {children}
    </SupportViewContext.Provider>
  );
}

// const { actif, boutiqueNom, demarrer, quitter } = useSupportView();
export function useSupportView() {
  const context = useContext(SupportViewContext);
  if (!context) {
    throw new Error("useSupportView doit être utilisé à l'intérieur d'un <SupportViewProvider>");
  }
  return context;
}
