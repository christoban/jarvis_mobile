import { create } from 'zustand';
import { BridgeNotification } from '../services/api.service';

interface NotificationsState {
  items: BridgeNotification[];
  unreadCount: number;
  addNotifications: (notifications: BridgeNotification[]) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,

  addNotifications: (notifications) =>
    set((state) => {
      if (!notifications.length) return state;

      const existingIds = new Set(state.items.map((n) => n.id));
      const incoming = notifications.filter((n) => !existingIds.has(n.id));
      if (!incoming.length) return state;

      const merged = [...incoming, ...state.items]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100);

      return {
        items: merged,
        unreadCount: state.unreadCount + incoming.length,
      };
    }),

  markAllRead: () => set({ unreadCount: 0 }),
  clear: () => set({ items: [], unreadCount: 0 }),
}));
