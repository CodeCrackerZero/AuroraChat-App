/**
 * Auth Context
 *
 * Fixes:
 * - useCallback deps korrekt (refreshUser hat keine externen deps)
 * - loading bleibt true bis DB + session fertig
 * - Fehler in refreshUser führen nicht zum Crash
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import * as db from '../services/database';

export interface User {
  id: string;
  username: string;
  is_omega: boolean;
  banned: boolean;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; msg?: string }>;
  register: (username: string, password: string) => Promise<{ ok: boolean; msg?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const session = await api.checkSession();
      if (session.logged_in && session.id) {
        setUser({
          id: session.id,
          username: session.username ?? '',
          is_omega: session.is_omega ?? false,
          banned: session.banned ?? false,
          avatar_url: session.avatar_url ?? null,
        });
        await db.saveSessionData('user_id', session.id);
        await db.saveSessionData('username', session.username ?? '');
      } else {
        setUser(null);
      }
    } catch (_e) {
      // Offline-Fallback: gecachte Session laden
      try {
        const userId = await db.getSessionData('user_id');
        const username = await db.getSessionData('username');
        if (userId && username) {
          setUser({ id: userId, username, is_omega: false, banned: false, avatar_url: null });
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    }
  }, []); // keine externen Abhängigkeiten

  useEffect(() => {
    let mounted = true;
    (async () => {
      await db.initDatabase();
      await api.loadSession();
      if (mounted) {
        await refreshUser();
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const r = await api.login(username, password);
    if (r.ok) await refreshUser();
    return { ok: r.ok as boolean, msg: r.msg as string | undefined };
  };

  const register = async (username: string, password: string) => {
    const r = await api.register(username, password);
    return { ok: r.ok as boolean, msg: r.msg as string | undefined };
  };

  const logout = async () => {
    await api.clearSession();
    await db.clearSessionData();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
