'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';

import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/features/auth/AuthProvider';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const hasMessagingConfig =
      Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID) &&
      Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
    if ('serviceWorker' in navigator && hasMessagingConfig) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => undefined);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
