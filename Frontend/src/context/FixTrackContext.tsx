'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';
import { defaultCurrentUser, initialComplaints } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import type { Complaint, FixTrackContextValue, User } from '@/types';

const FixTrackContext = createContext<FixTrackContextValue | null>(null);

export function FixTrackProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [complaints, setComplaints] = useState<Complaint[]>(initialComplaints);
  const [currentUser, setCurrentUser] = useState<User>(defaultCurrentUser);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Keep a separate status so demo data never implies the visitor is authenticated.
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [toast, setToast] = useState('');
  // Prevent a slower, older /auth/me request from overwriting a newer login result.
  const refreshRequestId = useRef(0);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('fixtrack-theme', nextTheme);
      return nextTheme;
    });
  }, []);

  const refreshAuth = useCallback(async (): Promise<User | null> => {
    const requestId = ++refreshRequestId.current;
    setAuthStatus('loading');

    try {
      // /auth/me verifies the signed cookie and reloads the user from server storage.
      const user = await api.getCurrentUser();
      // Store the short-lived CSRF token only in this tab's JavaScript memory after login,
      // Google sign-in, TOTP completion, or an authenticated page reload.
      await api.refreshCsrfToken();
      if (requestId === refreshRequestId.current) {
        // Preserve only the local profile-photo preview; all identity fields come from the backend.
        setCurrentUser((existing) => ({
          ...user,
          photo: existing.id === user.id ? existing.photo || '' : ''
        }));
        setAuthStatus('authenticated');
      }
      return user;
    } catch {
      // An absent, expired, or invalid cookie is treated as an unauthenticated visitor.
      api.clearCsrfToken();
      if (requestId === refreshRequestId.current) {
        setCurrentUser(defaultCurrentUser);
        setAuthStatus('unauthenticated');
      }
      return null;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // Invalidate in-flight refreshes before clearing the authoritative server cookie.
    refreshRequestId.current += 1;
    await api.logout();
    setCurrentUser(defaultCurrentUser);
    setAuthStatus('unauthenticated');
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('fixtrack-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : prefersDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    // The theme preference is UI-only. Authentication tokens stay in HttpOnly cookies.
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (pathname === '/totp') {
      // This route has only a five-minute pre-authentication cookie, not a full session.
      // Do not make an unnecessary /auth/me request while the user enters their code.
      setAuthStatus('unauthenticated');
      return;
    }

    // Restores authentication after reload without reading a token in browser JavaScript.
    void refreshAuth();
  }, [pathname, refreshAuth]);

  const value = useMemo<FixTrackContextValue>(
    () => ({
      complaints,
      setComplaints,
      currentUser,
      setCurrentUser,
      theme,
      toggleTheme,
      authStatus,
      refreshAuth,
      logout,
      notify
    }),
    [authStatus, complaints, currentUser, logout, notify, refreshAuth, theme, toggleTheme]
  );

  return (
    <FixTrackContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </FixTrackContext.Provider>
  );
}

export function useFixTrack(): FixTrackContextValue {
  const context = useContext(FixTrackContext);
  if (!context) {
    throw new Error('useFixTrack must be used inside FixTrackProvider');
  }
  return context;
}
