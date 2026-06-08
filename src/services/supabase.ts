// @ts-nocheck
// src/services/supabase.ts
// Instance Supabase unique pour toute l'app React
// Variables injectées par Vite depuis .env.local (dev) ou Vercel (production)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    'Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes.\n' +
    'Créer un fichier .env.local à la racine du projet.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,   // session conservée dans localStorage
    autoRefreshToken:  true,   // refresh automatique du JWT
    detectSessionInUrl: true,  // gestion des magic links / OAuth
  },
});

