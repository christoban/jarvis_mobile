/**
 * history.store.ts — Store Zustand pour l'historique des commandes
 * SEMAINE 7 — Vendredi
 *
 * Persiste en mémoire (Week 9 : persistence AsyncStorage/MMKV).
 * Chaque entrée contient : commande, résultat, statut, timestamp.
 */

import { create } from 'zustand';

export type CommandStatus = 'pending' | 'processing' | 'done' | 'error';

export interface HistoryEntry {
  id:         string;
  command:    string;
  result?:    string;
  status:     CommandStatus;
  timestamp:  number;       // Unix ms
  duration_ms?: number;     // Durée d'exécution
}

interface HistoryState {
  entries:     HistoryEntry[];
  addPending:  (id: string, command: string) => void;
  updateEntry: (id: string, patch: Partial<HistoryEntry>) => void;
  clear:       () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],

  addPending: (id, command) =>
    set(state => ({
      entries: [
        { id, command, status: 'pending' as CommandStatus, timestamp: Date.now() },
        ...state.entries,
      ].slice(0, 100),   // max 100 entrées
    })),

  updateEntry: (id, patch) =>
    set(state => ({
      entries: state.entries.map(e =>
        e.id === id ? { ...e, ...patch } : e
      ),
    })),

  clear: () => set({ entries: [] }),
}));
