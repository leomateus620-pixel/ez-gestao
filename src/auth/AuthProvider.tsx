import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const candidate = parsed?.currentSession ?? parsed;
      if (candidate?.access_token && candidate?.user) {
        const expiresAt = candidate.expires_at ?? 0;
        if (!expiresAt || expiresAt * 1000 > Date.now()) {
          return candidate as Session;
        }
      }
    }
  } catch {
    /* ignore */
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
    if (!cachedSession) setIsLoading(true);
    setError(null);

    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      window.setTimeout(() => resolve({ timedOut: true }), 3000);
    });

    Promise.race([
      supabase.auth.getSession().then((res) => ({ timedOut: false as const, res })),
      timeoutPromise,
    ])
      .then((outcome) => {
        if (cancelled) return;
        if ('timedOut' in outcome && outcome.timedOut === true && !('res' in outcome)) {
          console.error('[auth] getSession timed out');
          if (!cachedSession) {
            setError('Tempo esgotado ao verificar a sessão. Verifique sua conexão.');
            setSession(null);
          }
          setIsLoading(false);
          return;
        }
        const { res } = outcome as { res: Awaited<ReturnType<typeof supabase.auth.getSession>> };
        if (res.error) {
          console.error('[auth] getSession error', res.error);
          if (!cachedSession) setError(res.error.message);
        }
        setSession(res.data?.session ?? null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[auth] getSession threw', err);
        if (!cachedSession) {
          setError(err?.message ?? 'Falha ao inicializar autenticação');
          setSession(null);
        }
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
      data.subscription.unsubscribe();
    };
  }, [bootAttempt, cachedSession]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    error,
    retry: () => setBootAttempt((n) => n + 1),
    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signOut: async () => {
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
