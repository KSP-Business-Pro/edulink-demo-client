// e2e/messagerie.spec.ts
// Tests E2E - messagerie institutionnelle : RPC critiques (Sprint B17)
// 1. Validation hierarchique : fn_creer_message_officiel_brouillon,
//    fn_valider_message_officiel, fn_rejeter_message_officiel
// 2. Conservation : fn_previsualiser_purge, fn_purger_messages_expires,
//    fn_definir_gel_legal
// Approche RPC via supabase-js (decision du 11/08). Toutes les donnees de
// test sont creees dans l'Ecole Test E2E, marquees [E2E-MSG] et nettoyees.

import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminClient, adminUserClient, scolariteUserClient,
  E2E_ECOLE_TEST_ID, E2E_ETUDIANT_ID,
} from './helpers';

const MARQUEUR = '[E2E-MSG]';

let service: ReturnType<typeof adminClient>; // service role : seed + verifications (bypass RLS)
let admin: SupabaseClient;                   // session superadmin (role admin, ecole_id NULL)
let scolarite: SupabaseClient;               // session scolarite (ne doit PAS pouvoir valider/purger)
let expediteurSeed: { id: string; nom: string; role: string };

test.beforeAll(async () => {
  service = adminClient();
  admin = await adminUserClient();
  scolarite = await scolariteUserClient();

  const { data, error } = await service
    .from('utilisateurs')
    .select('id,nom,role')
    .eq('email', process.env.E2E_ADMIN_EMAIL!)
    .single();
  if (error || !data) throw new Error(`Compte admin de test introuvable : ${error?.message}`);
  expediteurSeed = data;
});

test.afterAll(async () => {
  // Nettoyage : uniquement les messages marques, uniquement l'ecole de test.
  // (message_destinataires / pieces jointes / audit suivent par ON DELETE CASCADE)
  await service.from('messages').delete()
    .eq('ecole_id', E2E_ECOLE_TEST_ID)
    .like('sujet', `${MARQUEUR}%`);
});

// ── Helpers locaux ──────────────────────────────────────────────────────────

async function creerBrouillon(client: SupabaseClient, sujet: string): Promise<string> {
  const { data, error } = await client.rpc('fn_creer_message_officiel_brouillon', {
    p_ecole_id: E2E_ECOLE_TEST_ID,
    p_mode: 'etudiant',
    p_etudiant_id: E2E_ETUDIANT_ID,
    p_sujet: sujet,
    p_contenu: 'Message genere par la suite E2E - peut etre supprime.',
    p_categorie: 'ADM',
  });
  expect(error, `creation brouillon : ${error?.message}`).toBeNull();
  expect(data).toBeTruthy();
  return data as string;
}

async function seedArchive(opts: { sujet: string; moisAge: number; gel?: boolean }): Promise<string> {
  const archiveLe = new Date();
  archiveLe.setMonth(archiveLe.getMonth() - opts.moisAge);
  const { data, error } = await service.from('messages').insert({
    ecole_id: E2E_ECOLE_TEST_ID,
    expediteur_id: expediteurSeed.id,
    expediteur_nom: expediteurSeed.nom,
    expediteur_role: expediteurSeed.role,
    destinataire_nom: 'Famille test E2E',
    destinataire_role: 'famille',
    sujet: opts.sujet,
    objet: opts.sujet,
    contenu: 'Archive generee par la suite E2E - peut etre supprimee.',
    categorie: 'ADM', // duree de conservation : 24 mois (politique globale)
    priorite: 'normale',
    statut: 'archive',
    // INSERT direct : le trigger d'horodatage ne joue que sur UPDATE OF statut,
    // donc archive_le doit etre pose explicitement ici.
    archive_le: archiveLe.toISOString(),
    gel_legal: opts.gel ?? false,
  }).select('id').single();
  expect(error, `seed archive : ${error?.message}`).toBeNull();
  return (data as { id: string }).id;
}

// ── 1. Validation hierarchique ──────────────────────────────────────────────

test.describe('Messagerie - message officiel et validation hierarchique', () => {

  test('un brouillon officiel ne cree aucun destinataire avant validation', async () => {
    const id = await creerBrouillon(scolarite, `${MARQUEUR} brouillon-invisible`);

    const { data: msg } = await service.from('messages')
      .select('statut,est_officiel').eq('id', id).single();
    expect(msg?.statut).toBe('brouillon');
    expect(msg?.est_officiel).toBe(true);

    const { count } = await service.from('message_destinataires')
      .select('*', { count: 'exact', head: true }).eq('message_id', id);
    expect(count).toBe(0);
  });

  test('la validation est refusee a un role non direction/admin', async () => {
    const id = await creerBrouillon(scolarite, `${MARQUEUR} refus-scolarite`);

    const { error } = await scolarite.rpc('fn_valider_message_officiel', { p_message_id: id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Seule la direction');
  });

  test('la validation direction insere le destinataire et passe le statut a envoye', async () => {
    const id = await creerBrouillon(scolarite, `${MARQUEUR} validation-ok`);

    const { data: nb, error } = await admin.rpc('fn_valider_message_officiel', { p_message_id: id });
    expect(error, `validation : ${error?.message}`).toBeNull();
    expect(nb).toBe(1);

    const { data: msg } = await service.from('messages')
      .select('statut,valide_par,valide_le').eq('id', id).single();
    expect(msg?.statut).toBe('envoye');
    expect(msg?.valide_par).not.toBeNull();
    expect(msg?.valide_le).not.toBeNull();

    const { data: dest } = await service.from('message_destinataires')
      .select('etudiant_id,destinataire_role').eq('message_id', id);
    expect(dest).toHaveLength(1);
    expect(dest![0].etudiant_id).toBe(E2E_ETUDIANT_ID);
    expect(dest![0].destinataire_role).toBe('famille');

    // Une double validation doit etre refusee
    const { error: e2 } = await admin.rpc('fn_valider_message_officiel', { p_message_id: id });
    expect(e2).not.toBeNull();
    expect(e2!.message).toContain('plus en attente');
  });

  test('le rejet passe le statut a annule avec motif, sans destinataires', async () => {
    const id = await creerBrouillon(scolarite, `${MARQUEUR} rejet`);

    const { error } = await admin.rpc('fn_rejeter_message_officiel', {
      p_message_id: id,
      p_motif: 'Test E2E - rejet volontaire',
    });
    expect(error, `rejet : ${error?.message}`).toBeNull();

    const { data: msg } = await service.from('messages')
      .select('statut,motif_rejet').eq('id', id).single();
    expect(msg?.statut).toBe('annule');
    expect(msg?.motif_rejet).toContain('rejet volontaire');

    const { count } = await service.from('message_destinataires')
      .select('*', { count: 'exact', head: true }).eq('message_id', id);
    expect(count).toBe(0);
  });
});

// ── 2. Conservation : previsualisation, purge, gel legal ───────────────────

test.describe('Messagerie - conservation et purge', () => {

  test('la previsualisation de purge est refusee a un role non direction/admin', async () => {
    const { error } = await scolarite.rpc('fn_previsualiser_purge', { p_ecole_id: E2E_ECOLE_TEST_ID });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('acces_refuse');
  });

  test('cycle complet : preview compte, purge supprime, gel legal et recent survivent', async () => {
    // ADM = 24 mois : 30 mois → expire ; 1 mois → non expire
    const expireId = await seedArchive({ sujet: `${MARQUEUR} expire`, moisAge: 30 });
    const geleId   = await seedArchive({ sujet: `${MARQUEUR} gele`, moisAge: 30, gel: true });
    const recentId = await seedArchive({ sujet: `${MARQUEUR} recent`, moisAge: 1 });

    const { data: preview, error: e1 } = await admin.rpc('fn_previsualiser_purge', { p_ecole_id: E2E_ECOLE_TEST_ID });
    expect(e1, `preview : ${e1?.message}`).toBeNull();
    expect(preview.nb_messages).toBeGreaterThanOrEqual(1);

    const { data: purge, error: e2 } = await admin.rpc('fn_purger_messages_expires', { p_ecole_id: E2E_ECOLE_TEST_ID });
    expect(e2, `purge : ${e2?.message}`).toBeNull();
    expect(purge.nb_messages).toBeGreaterThanOrEqual(1);

    const { data: restants } = await service.from('messages')
      .select('id').in('id', [expireId, geleId, recentId]);
    const ids = (restants ?? []).map((m: { id: string }) => m.id);
    expect(ids).not.toContain(expireId); // expire → purge
    expect(ids).toContain(geleId);       // gel legal → survit malgre l'expiration
    expect(ids).toContain(recentId);     // non expire → survit

    const { data: trace } = await service.from('journal_purges')
      .select('nb_messages').eq('ecole_id', E2E_ECOLE_TEST_ID)
      .order('execute_le', { ascending: false }).limit(1).single();
    expect(trace?.nb_messages).toBeGreaterThanOrEqual(1);
  });

  test('le gel legal se pose et se leve (direction/admin uniquement)', async () => {
    const id = await seedArchive({ sujet: `${MARQUEUR} gel-toggle`, moisAge: 1 });

    const { error: eScol } = await scolarite.rpc('fn_definir_gel_legal', { p_message_id: id, p_gel: true });
    expect(eScol).not.toBeNull();
    expect(eScol!.message).toContain('acces_refuse');

    const { error: ePose } = await admin.rpc('fn_definir_gel_legal', { p_message_id: id, p_gel: true });
    expect(ePose, `pose gel : ${ePose?.message}`).toBeNull();
    let { data: m } = await service.from('messages').select('gel_legal').eq('id', id).single();
    expect(m?.gel_legal).toBe(true);

    const { error: eLeve } = await admin.rpc('fn_definir_gel_legal', { p_message_id: id, p_gel: false });
    expect(eLeve, `leve gel : ${eLeve?.message}`).toBeNull();
    ({ data: m } = await service.from('messages').select('gel_legal').eq('id', id).single());
    expect(m?.gel_legal).toBe(false);
  });
});