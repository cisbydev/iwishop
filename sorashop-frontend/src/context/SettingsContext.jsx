import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [parametres, setParametres] = useState(null);
  const [utilisateur, setUtilisateur] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchParametres = async () => {
    try {
      const response = await api.get('parametres/');
      setParametres(response.data);
    } catch (err) {
      console.error("Erreur chargement des paramètres de la boutique", err);
    }
  };

  const fetchUtilisateur = async () => {
    try {
      const response = await api.get('accounts/me/');
      setUtilisateur(response.data);
    } catch (err) {
      console.error("Erreur chargement de l'utilisateur connecté", err);
    }
  };

  const fetchTout = async () => {
    setLoading(true);
    await Promise.all([fetchParametres(), fetchUtilisateur()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTout();
  }, []);

  return (
    <SettingsContext.Provider value={{
      parametres,
      utilisateur,
      loading,
      refetchParametres: fetchParametres,
      refetchUtilisateur: fetchUtilisateur,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

// Hook pratique à utiliser dans n'importe quel composant :
// const { parametres, utilisateur } = useSettings();
// const devise = parametres?.devise || 'FCFA';
// const estProprietaire = utilisateur?.est_proprietaire;
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings doit être utilisé à l'intérieur d'un <SettingsProvider>");
  }
  return context;
}
