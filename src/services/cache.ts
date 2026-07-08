// src/services/cache.ts
// Cache mémoire simple à durée de vie (TTL) pour les données peu volatiles
// (programmes, UE, semestres...). Portée : session navigateur uniquement —
// pas de persistance entre rechargements de page.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  // Dédoublonnage : si un appel est déjà en cours pour cette clé, on le
  // réutilise plutôt que de déclencher une deuxième requête réseau identique.
  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = fetchFn()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      inFlight.delete(key);
      return value;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

export function invalidate(keyOrPrefix: string): void {
  // Invalide une clé exacte, ou toutes les clés commençant par ce préfixe
  // (ex: invalidate('programmes:') efface toutes les écoles d'un coup).
  for (const key of store.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      store.delete(key);
    }
  }
}
