import type { User } from '@hostels/shared';
import { ApiError } from '@hostels/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { getToken, setToken } from './token';

type AuthState = {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!(await getToken())) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.me.get());
    } catch (e) {
      // A revoked or expired session signs the person out; network errors keep them signed in.
      if (e instanceof ApiError && e.status === 401) {
        await setToken(null);
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      refresh,
      signIn: async (token, u) => {
        await setToken(token);
        setUser(u);
      },
      signOut: async () => {
        await api.auth.logout().catch(() => undefined);
        await setToken(null);
        setUser(null);
      },
    }),
    [user, ready, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
