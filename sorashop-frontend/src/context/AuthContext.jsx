import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, {
  bootstrapAuthentication,
  clearAccessToken,
  logout as logoutRequest,
  setAccessToken,
  setAuthFailureHandler,
} from '../services/api';
import { effacerDonneesDeSession } from '../services/deconnexion';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    setAuthFailureHandler(() => {
      if (active) setIsAuthenticated(false);
    });

    bootstrapAuthentication().then((authenticated) => {
      if (!active) return;
      setIsAuthenticated(authenticated);
      setIsLoading(false);
    });

    return () => {
      active = false;
      setAuthFailureHandler(null);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const response = await api.post('token/', { username, password });
    setAccessToken(response.data.access);
    setIsAuthenticated(true);
    return response.data;
  }, []);

  // Échec de token/logout/ :
  // - aucune réponse (hors ligne, erreur réseau) ou réponse 5xx (souvent
  //   Render qui sort de veille) : le cookie de rafraîchissement existe
  //   peut-être encore ; rien n'est effacé et l'erreur remonte ;
  // - réponse 4xx : on déconnecte l'appareil. Sur Safari (iPhone), qui
  //   bloque les cookies tiers, csrf/ ne peut pas poser son cookie,
  //   token/logout/ répond 403, et il n'y a aucun cookie à révoquer.
  // Après un changement de mot de passe, le serveur a déjà révoqué ce
  // cookie : déconnexion dans tous les cas.
  const logout = useCallback(async ({ cookieDejaRevoque = false } = {}) => {
    try {
      await logoutRequest();
    } catch (err) {
      const status = err?.response?.status;
      const refusClient = status >= 400 && status < 500;
      if (!cookieDejaRevoque && !refusClient) throw err;
    }
    clearAccessToken();
    // Isolation hors ligne : déconnexion volontaire seulement (une
    // session expirée passe par authFailureHandler, qui n'efface rien).
    await effacerDonneesDeSession();
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ isLoading, isAuthenticated, login, logout }),
    [isLoading, isAuthenticated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit etre utilise dans AuthProvider.');
  }
  return context;
}
