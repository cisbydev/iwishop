import { createContext, useContext } from 'react';

export const SupportViewContext = createContext(null);

export function useSupportView() {
  const context = useContext(SupportViewContext);
  if (!context) {
    throw new Error("useSupportView doit être utilisé à l'intérieur d'un <SupportViewProvider>");
  }
  return context;
}
