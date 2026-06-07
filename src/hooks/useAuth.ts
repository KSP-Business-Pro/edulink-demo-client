// src/hooks/useAuth.ts
// Hook pour consommer AuthContext depuis n'importe quel composant
// Lance une erreur explicite si utilisé hors du AuthProvider

import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      'useAuth() doit être utilisé dans un composant enfant de <AuthProvider>.\n' +
      'Vérifiez que AuthProvider encapsule votre arbre de composants dans App.tsx.'
    );
  }
  return ctx;
}
