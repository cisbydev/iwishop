import { createContext, useContext } from 'react';

export const NavigationPanneauContext = createContext(null);

export function useNavigationPanneau() {
  const contexte = useContext(NavigationPanneauContext);
  if (!contexte) {
    throw new Error('useNavigationPanneau doit être utilisé à l’intérieur de NavigationPanneauProvider');
  }
  return contexte;
}
