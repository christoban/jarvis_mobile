import { useEffect } from 'react';
import { getNotifications } from '../services/api.service';
import { useNotificationsStore } from '../store/notifications.store';

const POLL_INTERVAL_MS = 10_000;

export function useNotifications(autoStart: boolean = true) {
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const addNotifications = useNotificationsStore((s) => s.addNotifications);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    if (!autoStart) return;

    let active = true;

    const tick = async () => {
      const result = await getNotifications(30);
      if (!active || !result.ok || !result.notifications.length) return;
      addNotifications(result.notifications);
    };

    tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [autoStart, addNotifications]);

  return {
    notifications: items,
    unreadCount,
    lastNotification: items[0] ?? null,
    markAllRead,
  };
}
