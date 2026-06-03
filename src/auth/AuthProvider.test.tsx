import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabaseConfigError: null,
  supabase: {
    auth: authMock,
  },
}));

function AuthProbe() {
  const { error, isLoading, session } = useAuth();

  return (
    <dl>
      <dt>loading</dt>
      <dd data-testid="loading">{String(isLoading)}</dd>
      <dt>session</dt>
      <dd data-testid="session">{session ? 'authenticated' : 'anonymous'}</dd>
      <dt>error</dt>
      <dd data-testid="error">{error ?? ''}</dd>
    </dl>
  );
}

describe('AuthProvider bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    authMock.getSession.mockReset();
    authMock.onAuthStateChange.mockReset();
    authMock.signInWithPassword.mockReset();
    authMock.signOut.mockReset();
    authMock.unsubscribe.mockReset();
    authMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: authMock.unsubscribe } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('falls back to anonymous access when session bootstrap times out', async () => {
    vi.useFakeTimers();
    authMock.getSession.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('session')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('falls back to anonymous access when session bootstrap rejects', async () => {
    authMock.getSession.mockRejectedValue(new Error('Network unavailable'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });
});
