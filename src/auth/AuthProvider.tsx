import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Safety timeout: if getSession() never settles (network stalled, Cloud
    // still booting), release the loading state so the user lands on Login
    // instead of staring at a blank screen.
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      console.error('[auth] getSession timed out, falling back to logged-out state');
      setSession(null);
      setIsLoading(false);
    }, 6000);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[auth] getSession error', error);
        setSession(data?.session ?? null);
        setIsLoading(false);
        window.clearTimeout(timeout);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[auth] getSession threw', error);
        setSession(null);
        setIsLoading(false);
        window.clearTimeout(timeout);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setIsLoading(false);
      window.clearTimeout(timeout);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
