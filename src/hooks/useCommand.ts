/**
 * useCommand.ts — Hook central pour envoyer une commande
 * SEMAINE 7 — Mercredi/Jeudi
 *
 * Orchestre :
 *   1. Ajout immédiat dans l'historique (status: pending)
 *   2. sendAndWait → Azure Function → PC Agent
 *   3. Mise à jour de l'historique avec le résultat
 */

import { useState, useCallback } from 'react';
import { sendAndWait, sendConfirmation, waitForCommandResult } from '../services/api.service';
import { useHistoryStore }    from '../store/history.store';

export type SendStatus = 'idle' | 'sending' | 'polling' | 'done' | 'error';

interface UseCommandResult {
  status:      SendStatus;
  lastResult:  string | null;
  lastError:   string | null;
  pendingConfirmation: {
    id: string;
    message: string;
  } | null;
  send:        (command: string) => Promise<void>;
  resolveConfirmation: (action: 'confirm' | 'refuse') => Promise<void>;
  reset:       () => void;
}

// Générateur d'ID simple (pas besoin d'uuid)
let _seq = 0;
const newId = () => `cmd_${Date.now()}_${++_seq}`;

export function useCommand(): UseCommandResult {
  const [status,     setStatus]     = useState<SendStatus>('idle');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastError,  setLastError]  = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ id: string; message: string } | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [pendingHistoryId, setPendingHistoryId] = useState<string | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number>(0);

  const { addPending, updateEntry } = useHistoryStore();

  const send = useCallback(async (command: string) => {
    if (!command.trim()) return;

    const id      = newId();
    const startMs = Date.now();

    setStatus('sending');
    setLastResult(null);
    setLastError(null);
    setPendingConfirmation(null);
    setPendingCommandId(null);
    setPendingHistoryId(null);
    setPendingStartedAt(0);

    // Ajouter dans l'historique immédiatement
    addPending(id, command);

    try {
      // sendAndWait gère : POST /command + polling /poll
      const result = await sendAndWait(
        command,
        (pollStatus, attempt) => {
          // Passer en 'polling' après le premier poll
          if (attempt === 1) setStatus('polling');
          // Mapper les statuts API vers les statuts HistoryEntry valides
          const historyStatus =
            pollStatus === 'sending'  ? 'pending'    :
            pollStatus === 'polling'  ? 'processing' :
            pollStatus === 'success'  ? 'done'       :
            pollStatus === 'timeout'  ? 'error'       :
            pollStatus === 'pending'  ? 'pending'    :
            pollStatus === 'error'    ? 'error'       : 'processing';
          updateEntry(id, { status: historyStatus });
        },
      );

      const duration = Date.now() - startMs;

      if (result.ok) {
        const payload = result.data?.result ?? result.data ?? {};
        const msg =
          (typeof payload === 'string' ? payload : null) ??
          payload?.message ??
          payload?.display ??
          result.data?.message ??
          'Commande exécutée.';
        setLastResult(msg);
        setStatus('done');
        updateEntry(id, {
          status:      result.data.status === 'error' ? 'error' : 'done',
          result:      msg,
          duration_ms: duration,
        });
      } else if (result.awaitingConfirm && result.data?.confirm_id) {
        const message = result.data?.message || 'Confirmation requise';
        setPendingConfirmation({ id: String(result.data.confirm_id), message });
        setPendingCommandId(String(result.data.command_id || ''));
        setPendingHistoryId(id);
        setPendingStartedAt(startMs);
        setStatus('polling');
      } else {
        setLastError(result.error ?? 'Une erreur inconnue est survenue');
        setStatus('error');
        updateEntry(id, {
          status:      'error',
          result:      result.error,
          duration_ms: duration,
        });
      }
    } catch (e) {
      const msg = String(e);
      setLastError(msg);
      setStatus('error');
      updateEntry(id, { status: 'error', result: msg });
    }
  }, [addPending, updateEntry]);

  const resolveConfirmation = useCallback(async (action: 'confirm' | 'refuse') => {
    if (!pendingConfirmation || !pendingCommandId || !pendingHistoryId) return;

    const durationBase = pendingStartedAt || Date.now();
    const confirmRes = await sendConfirmation(pendingConfirmation.id, action);

    if (!confirmRes.ok) {
      const msg = confirmRes.error || 'Confirmation impossible';
      setLastError(msg);
      setStatus('error');
      updateEntry(pendingHistoryId, {
        status: 'error',
        result: msg,
        duration_ms: Date.now() - durationBase,
      });
      setPendingConfirmation(null);
      return;
    }

    const result = await waitForCommandResult(pendingCommandId, (pollStatus, attempt) => {
      if (attempt === 1 && pollStatus === 'polling') setStatus('polling');
    });

    const duration = Date.now() - durationBase;

    if (result.ok) {
      const msg = result.data?.result ?? result.data?.message ?? 'Commande exécutée.';
      setLastResult(msg);
      setStatus('done');
      updateEntry(pendingHistoryId, {
        status: 'done',
        result: msg,
        duration_ms: duration,
      });
    } else {
      const msg = result.error ?? result.data?.message ?? 'Action annulée';
      setLastError(msg);
      setStatus('error');
      updateEntry(pendingHistoryId, {
        status: 'error',
        result: msg,
        duration_ms: duration,
      });
    }

    setPendingConfirmation(null);
    setPendingCommandId(null);
    setPendingHistoryId(null);
    setPendingStartedAt(0);
  }, [pendingConfirmation, pendingCommandId, pendingHistoryId, pendingStartedAt, updateEntry]);

  const reset = useCallback(() => {
    setStatus('idle');
    setLastResult(null);
    setLastError(null);
    setPendingConfirmation(null);
    setPendingCommandId(null);
    setPendingHistoryId(null);
    setPendingStartedAt(0);
  }, []);

  return { status, lastResult, lastError, pendingConfirmation, send, resolveConfirmation, reset };
}
