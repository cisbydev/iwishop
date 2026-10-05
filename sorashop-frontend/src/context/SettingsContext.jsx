import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { SettingsContext } from './settingsContextValue';

export function SettingsProvider({ children }) {
  const [parametres, setParametres] = useState(null);
  const [utilisateur, setUtilisateur] = useState(null);
  // null tant que non chargé. Plus lu par aucun écran depuis l'offre unique :
  // gardé pour le chantier « bandeau après l'expiration » (cf. EN_COURS).
  const [abonnement, setAbonnement] = useState(null);
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

  const fetchAbonnement = useCallback(async () => {
    try {
      const response = await api.get('tenants/mon-abonnement/');
      setAbonnement(response.data);
    } catch (err) {
      console.error("Erreur chargement de l'abonnement", err);
    }
  }, []);

  const fetchTout = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchParametres(), fetchUtilisateur(), fetchAbonnement()]);
    setLoading(false);
  }, [fetchParametres, fetchUtilisateur, fetchAbonnement]);

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
      abonnement,
      loading,
      refetchParametres: fetchParametres,
      refetchUtilisateur: fetchUtilisateur,
      refetchAbonnement: fetchAbonnement,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
