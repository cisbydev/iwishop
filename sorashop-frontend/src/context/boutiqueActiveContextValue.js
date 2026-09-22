import { createContext, useContext } from 'react';

export const BoutiqueActiveContext = createContext(null);

export function useBoutiqueActive() {
  const context = useContext(BoutiqueActiveContext);
  if (!context) {
    throw new Error("useBoutiqueActive doit être utilisé à l'intérieur d'un <BoutiqueActiveProvider>");
  }
  return context;
}
