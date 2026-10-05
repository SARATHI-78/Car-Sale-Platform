import { useEffect, useState, useCallback } from 'react';
import { setFirestoreNetworkMode } from '../lib/firebase';

export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      if (!simulatedOffline) {
        setFirestoreNetworkMode(true).catch(console.error);
        setLastSyncedAt(new Date());
      }
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      setFirestoreNetworkMode(false).catch(console.error);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [simulatedOffline]);

  const toggleSimulatedOffline = useCallback(async () => {
    const nextState = !simulatedOffline;
    setSimulatedOffline(nextState);
    if (nextState) {
      await setFirestoreNetworkMode(false);
    } else if (browserOnline) {
      await setFirestoreNetworkMode(true);
      setLastSyncedAt(new Date());
    }
  }, [simulatedOffline, browserOnline]);

  return {
    isOnline: browserOnline && !simulatedOffline,
    simulatedOffline,
    toggleSimulatedOffline,
    lastSyncedAt,
    markSynced: () => setLastSyncedAt(new Date()),
  };
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  return await Notification.requestPermission();
}

export function triggerBrowserPushNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/icon.svg',
      });
    } catch {
      // Fallback handled by in-app notification banner
    }
  }
}
