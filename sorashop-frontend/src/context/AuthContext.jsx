import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, {
  bootstrapAuthentication,
  clearAccessToken,
  logout as logoutRequest,
  setAccessToken,
  setAuthFailureHandler,
} from '../services/api';

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

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearAccessToken();
      setIsAuthenticated(false);
    }
  }, []);

  const value = useMemo(
    () => ({ isLoading, isAuthenticated, login, logout }),
    [isLoading, isAuthenticated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit etre utilise dans AuthProvider.');
  }
  return context;
}
