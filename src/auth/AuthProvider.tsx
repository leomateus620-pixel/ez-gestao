import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '@/integrations/supabase/client';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_BOOT_TIMEOUT_MS = 3000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

function toAuthErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getAuthStorageKey() {
  if (!SUPABASE_URL) return null;
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function readCachedSession(): Session | null {
  if (typeof window === 'undefined') return null;

  try {
    const authStorageKey = getAuthStorageKey();
    if (!authStorageKey) return null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== authStorageKey) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const candidate = parsed?.currentSession ?? parsed;
        if (candidate?.access_token && candidate?.user) {
          const expiresAt = candidate.expires_at ?? 0;
          if (!expiresAt || expiresAt * 1000 > Date.now()) {
            return candidate as Session;
          }
        }
      } catch (parseErr) {
        console.warn('[auth] removing corrupted session entry', key, parseErr);
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      }
    }
  } catch {
    /* ignore corrupt cached auth data */
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [cachedSession] = useState<Session | null>(() => readCachedSession());
  const [session, setSession] = useState<Session | null>(cachedSession);
  const [isLoading, setIsLoading] = useState(cachedSession === null);
  const [error, setError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    if (!isSupabaseConfigured) {
      setSession(null);
      setIsLoading(false);
      setError(supabaseConfigError ?? 'Supabase nao configurado.');
      return () => {
        cancelled = true;
      };
    }

    if (!cachedSession) setIsLoading(true);
    setError(null);

    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timeoutId = window.setTimeout(() => resolve({ timedOut: true }), AUTH_BOOT_TIMEOUT_MS);
    });

    Promise.race([
      supabase.auth.getSession().then((res) => ({ timedOut: false as const, res })),
      timeoutPromise,
    ])
      .then((outcome) => {
        if (cancelled) return;
        if (timeoutId) window.clearTimeout(timeoutId);

        if ('timedOut' in outcome && outcome.timedOut === true && !('res' in outcome)) {
          console.warn('[auth] getSession timed out; falling back to login screen');
          if (!cachedSession) setSession(null);
          setError(null);
          setIsLoading(false);
          return;
        }

        const { res } = outcome as { res: Awaited<ReturnType<typeof supabase.auth.getSession>> };
        if (res.error) {
          console.warn('[auth] getSession error; falling back to login screen', res.error);
        }
        setSession(res.data?.session ?? null);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        console.warn('[auth] getSession threw; falling back to login screen', err);
        if (!cachedSession) setSession(null);
        setError(null);
        setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setIsLoading(false);
      setError(null);
    });

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      data.subscription.unsubscribe();
    };
  }, [bootAttempt, cachedSession]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    error,
    retry: () => setBootAttempt((n) => n + 1),
    signIn: async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        return supabaseConfigError ?? 'Supabase nao configurado.';
      }
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      } catch (err) {
        console.error('[auth] signIn threw', err);
        return toAuthErrorMessage(err, 'Falha ao autenticar. Tente novamente.');
      }
    },
    signOut: async () => {
      if (!isSupabaseConfigured) return;
      await supabase.auth.signOut();
    },
  }), [session, isLoading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
