-- ═══════════════════════════════════════════════════════════════════════
-- B12.1 — Authentification à deux facteurs (2FA) pour le personnel
-- VERSION CORRIGÉE : ne touche plus à audit_log/audit_logs, qui existent
-- déjà et sont gérés par fn_audit_log(). Le 2FA les réutilise tel quel.
-- À exécuter dans le SQL Editor Supabase (projet kcfpvnrgutkhakogbjip)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Téléphone sur les comptes staff (nécessaire pour le canal SMS) ─────
-- (déjà exécuté avec succès — instruction laissée idempotente si tu relances
--  le script en entier, elle ne fera rien de plus)
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS telephone TEXT;

-- ── 2. Table dédiée aux OTP de connexion staff ────────────────────────────
-- Distincte de `otp_codes` (portail famille, clé par téléphone, avant session
-- Auth) : ici l'utilisateur a DÉJÀ une session Supabase Auth valide (login
-- mot de passe réussi), l'OTP est un second facteur clé par user_id.
-- Le code est haché (SHA-256) avant stockage — jamais en clair en base.
CREATE TABLE IF NOT EXISTS staff_otp_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash     TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  destination   TEXT NOT NULL,           -- email ou téléphone masqué (ex: ari***@edulink.bj)
  expires_at    TIMESTAMPTZ NOT NULL,
  verified_at   TIMESTAMPTZ,
  attempts      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_otp_user_created
  ON staff_otp_verifications(user_id, created_at DESC);

-- RLS : aucun accès client direct (ni lecture ni écriture). Seules les
-- Edge Functions (service_role) touchent cette table.
ALTER TABLE staff_otp_verifications ENABLE ROW LEVEL SECURITY;
-- (Aucune policy créée = deny-all par défaut pour anon/authenticated)

-- ═══════════════════════════════════════════════════════════════════════
-- Le journal d'audit (B12.2) réutilise audit_logs (pluriel) + fn_audit_log()
-- déjà en place — aucune nouvelle table nécessaire. Les Edge Functions
-- send-otp/verify-otp appellent fn_audit_log() avec module='auth_2fa'.
--
-- Vérification rapide après exécution :
--   SELECT * FROM staff_otp_verifications LIMIT 1;
-- ═══════════════════════════════════════════════════════════════════════
