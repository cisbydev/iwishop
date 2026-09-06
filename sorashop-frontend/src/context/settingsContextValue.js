import { createContext, useContext } from 'react';

export const SettingsContext = createContext(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings doit être utilisé à l'intérieur d'un <SettingsProvider>");
  }
  return context;
}
