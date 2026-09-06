import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { SettingsContext } from './settingsContextValue';

export function SettingsProvider({ children }) {
  const [parametres, setParametres] = useState(null);
  const [utilisateur, setUtilisateur] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchParametres = useCallback(async () => {
    try {
      const response = await api.get('parametres/');
      setParametres(response.data);
    } catch (err) {
      console.error("Erreur chargement des paramètres de la boutique", err);
    }
  }, []);

  const fetchUtilisateur = useCallback(async () => {
    try {
      const response = await api.get('accounts/me/');
      setUtilisateur(response.data);
    } catch (err) {
      console.error("Erreur chargement de l'utilisateur connecté", err);
    }
  }, []);

  const fetchTout = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchParametres(), fetchUtilisateur()]);
    setLoading(false);
  }, [fetchParametres, fetchUtilisateur]);

  useEffect(() => {
    const loadSettings = async () => {
      await fetchTout();
    };

    void loadSettings();
  }, [fetchTout]);

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
