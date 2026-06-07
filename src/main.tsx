// src/main.tsx
// Point d'entrée Vite — monte l'app React dans #root

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Reset CSS minimal — le reste est géré par les composants
const globalStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f1f5f9; color: #1e293b; }
  a { color: inherit; }
  button { font-family: inherit; }
`;
const style = document.createElement('style');
style.textContent = globalStyles;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
