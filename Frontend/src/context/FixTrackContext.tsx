'use client';

import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { defaultCurrentUser, initialComplaints } from '@/data/fixtrack-data';
import type { Complaint, FixTrackContextValue, User } from '@/types';

const FixTrackContext = createContext<FixTrackContextValue | null>(null);

export function FixTrackProvider({ children }: PropsWithChildren) {
  const [complaints, setComplaints] = useState<Complaint[]>(initialComplaints);
  const [currentUser, setCurrentUser] = useState<User>(defaultCurrentUser);
  const [toast, setToast] = useState('');

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const value = useMemo<FixTrackContextValue>(
    () => ({ complaints, setComplaints, currentUser, setCurrentUser, notify }),
    [complaints, currentUser]
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
