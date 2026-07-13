'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { defaultCurrentUser, initialComplaints } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import type { Complaint, FixTrackContextValue, User } from '@/types';

const FixTrackContext = createContext<FixTrackContextValue | null>(null);
const inactivityLogoutMs = 15 * 60 * 1000;
const inactivityWarningMs = 14 * 60 * 1000;
const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'focus'] as const;

export function FixTrackProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const [complaints, setComplaints] = useState<Complaint[]>(initialComplaints);
  const [currentUser, setCurrentUser] = useState<User>(defaultCurrentUser);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Keep a separate status so demo data never implies the visitor is authenticated.
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [toast, setToast] = useState('');
  const [inactivityWarningVisible, setInactivityWarningVisible] = useState(false);
  // Prevent a slower, older /auth/me request from overwriting a newer login result.
  const refreshRequestId = useRef(0);
  const warningTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);

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
    setInactivityWarningVisible(false);
    setCurrentUser(defaultCurrentUser);
    setAuthStatus('unauthenticated');
  }, []);

  const clearInactivityTimers = useCallback(() => {
    if (warningTimerRef.current) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }

    if (logoutTimerRef.current) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const autoLogout = useCallback(async () => {
    clearInactivityTimers();
    refreshRequestId.current += 1;

    try {
      // Use the normal logout endpoint so HttpOnly session cookies are expired by the backend.
      await api.logout();
      notify('You were logged out after 15 minutes of inactivity.');
    } catch {
      // If the network is unavailable, clear local auth state so protected UI is not left visible.
      api.clearCsrfToken();
      notify('Session ended after inactivity. Please log in again.');
    } finally {
      setInactivityWarningVisible(false);
      setCurrentUser(defaultCurrentUser);
      setAuthStatus('unauthenticated');
      router.replace('/login');
      router.refresh();
    }
  }, [clearInactivityTimers, notify, router]);

  const restartInactivityTimers = useCallback(() => {
    clearInactivityTimers();
    setInactivityWarningVisible(false);

    warningTimerRef.current = window.setTimeout(() => {
      setInactivityWarningVisible(true);
    }, inactivityWarningMs);

    logoutTimerRef.current = window.setTimeout(() => {
      void autoLogout();
    }, inactivityLogoutMs);
  }, [autoLogout, clearInactivityTimers]);

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

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      clearInactivityTimers();
      setInactivityWarningVisible(false);
      return;
    }

    // Any real user activity continues the session and starts a fresh 15-minute window.
    restartInactivityTimers();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, restartInactivityTimers, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, restartInactivityTimers);
      });
      clearInactivityTimers();
    };
  }, [authStatus, clearInactivityTimers, restartInactivityTimers]);

  const value = useMemo<FixTrackContextValue>(
    () => ({
      complaints,
      setComplaints,
      currentUser,
      setCurrentUser,
      theme,
      toggleTheme,
      inactivityWarningVisible,
      authStatus,
      refreshAuth,
      logout,
      notify
    }),
    [authStatus, complaints, currentUser, inactivityWarningVisible, logout, notify, refreshAuth, theme, toggleTheme]
  );

  return (
    <FixTrackContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {inactivityWarningVisible && authStatus === 'authenticated' && (
        <div className="session-warning" role="alert">
          You will be logged out in 1 minute due to inactivity. Move your mouse, press a key, or tap the page to stay signed in.
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
