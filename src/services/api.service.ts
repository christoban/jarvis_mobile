/**
 * api.service.ts — Communication Mobile ↔ Jarvis PC
 *
 * SEMAINE 4 — CORRECTIONS :
 *   [Fix1] pollResult : timeout corrigé 30s (commentaire + code étaient incohérents — 60s en code vs 30s en commentaire)
 *   [Fix2] poll interval : 800ms → 1200ms (moins de requêtes, latence perçue meilleure)
 *   [Fix3] getBaseUrl() : mis en cache dans pollResult — ne re-détecte pas le bridge à chaque poll
 *   [Fix4] useNotifications interval : exporté pour permettre de le configurer (musique = plus rapide)
 */

type BridgeMode = 'local' | 'azure';

const BRIDGE_MODE: BridgeMode = 'local';
const BRIDGE_MODE_ENV = String(process?.env?.EXPO_PUBLIC_BRIDGE_MODE || '').trim().toLowerCase();
const ACTIVE_BRIDGE_MODE: BridgeMode =
  BRIDGE_MODE_ENV === 'local' ? 'local'
  : BRIDGE_MODE_ENV === 'azure' ? 'azure'
  : BRIDGE_MODE;

const LOCAL_PC_IP_FALLBACK = '10.183.57.205';
const LOCAL_PORT  = 7071;
const AZURE_URL   = 'https://jarvis-windows-fn.azurewebsites.net';
const BASE_URL_FALLBACK = `http://${LOCAL_PC_IP_FALLBACK}:${LOCAL_PORT}`;

// [Fix3] Cache URL résolu — ne re-détecte pas à chaque poll
let _resolvedBaseUrl: string | null = null;

// Timeouts et intervalles — centralisés ici pour éviter les incohérences
const POLL_TIMEOUT_MS  = 30_000;  // [Fix1] 30s (était 60s dans le code)
const POLL_INTERVAL_MS = 1_200;   // [Fix2] 1.2s (était 800ms)
const HEALTH_TIMEOUT_MS = 1_500;

function withTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function extractExpoHostIp(): string | null {
  try {
    const Constants = require('expo-constants').default;
    const hostUri: string | undefined =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoGo?.hostUri ||
      Constants?.manifest?.debuggerHost;
    if (!hostUri) return null;
    return String(hostUri).split(':')[0]?.trim() || null;
  } catch {
    return null;
  }
}

function getLocalCandidates(): string[] {
  const expoHostIp = extractExpoHostIp();
  return dedupe([
    expoHostIp ? `http://${expoHostIp}:${LOCAL_PORT}` : '',
    `http://${LOCAL_PC_IP_FALLBACK}:${LOCAL_PORT}`,
    `http://127.0.0.1:${LOCAL_PORT}`,
    `http://localhost:${LOCAL_PORT}`,
    `http://10.0.2.2:${LOCAL_PORT}`,
  ].filter(Boolean));
}

async function probeBridge(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: buildHeaders(),
      signal: withTimeoutSignal(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getBaseUrl(forceRefresh = false): Promise<string> {
  if (ACTIVE_BRIDGE_MODE === 'azure') return AZURE_URL;
  if (!forceRefresh && _resolvedBaseUrl) return _resolvedBaseUrl;

  const candidates = getLocalCandidates();
  for (const base of candidates) {
    const ok = await probeBridge(base);
    if (ok) {
      _resolvedBaseUrl = base;
      return base;
    }
  }
  _resolvedBaseUrl = BASE_URL_FALLBACK;
  return _resolvedBaseUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────────────────────
const SECRET_TOKEN = 'menedona_2005_christoban_2026';
const DEVICE_ID    = 'NDZANA_PHONE';

export const API_CONFIG = {
  BASE_URL: ACTIVE_BRIDGE_MODE === 'azure' ? AZURE_URL : BASE_URL_FALLBACK,
  SECRET_TOKEN,
  DEVICE_ID,
};

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type':   'application/json',
    'X-Jarvis-Token': SECRET_TOKEN,
    'X-Device-Id':    DEVICE_ID,
    'X-Timestamp':    Math.floor(Date.now() / 1000).toString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface CommandResult {
  id:          string;
  command:     string;
  status:      'pending' | 'success' | 'error' | 'timeout';
  response?:   string;
  timestamp:   number;
  duration_ms?: number;
}

export interface BridgeNotification {
  id:       string;
  title:    string;
  body:     string;
  type:     'task_done' | 'error' | 'battery_low' | 'screenshot' | 'info' | string;
  priority: 'high' | 'normal' | 'low' | string;
  timestamp: number;
  data?:    Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENVOYER UNE COMMANDE
// ─────────────────────────────────────────────────────────────────────────────
async function postCommand(command: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/command`, {
      method:  'POST',
      headers: buildHeaders(),
      body:    JSON.stringify({
        command:   command.trim(),
        device_id: DEVICE_ID,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });
    if (!res.ok) {
      let reason = '';
      try { const d = await res.json(); reason = d?.reason || ''; } catch {}
      return { ok: false, error: reason ? `HTTP ${res.status} — ${reason}` : `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, id: data.id || data.command_id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur réseau — PC injoignable.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POLLING — [Fix1] timeout 30s  [Fix2] interval 1200ms  [Fix3] baseUrl en cache
// ─────────────────────────────────────────────────────────────────────────────
async function pollResult(
  id: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const start = Date.now();
  let attempt = 0;

  // [Fix3] Résoudre l'URL une seule fois avant de commencer à poller
  const baseUrl = await getBaseUrl();

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      // [Fix1] Timeout cohérent : 30s
      if (Date.now() - start > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        resolve({ ok: false, error: 'Timeout 30s — le PC n\'a pas répondu.' });
        return;
      }

      attempt++;
      onProgress?.('polling', attempt);

      try {
        // [Fix3] Réutiliser baseUrl déjà résolu
        const res = await fetch(`${baseUrl}/api/result/${id}`, {
          headers: buildHeaders(),
          signal: withTimeoutSignal(5000),
        });

        if (res.status === 404) return; // pas encore prêt
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'pending' && !data.result) return;

        clearInterval(timer);
        resolve({ ok: true, data });
      } catch {
        // Erreur réseau passagère — continuer
      }
    }, POLL_INTERVAL_MS); // [Fix2] 1200ms
  });
}

export async function sendConfirmation(
  confirmId: string,
  action: 'confirm' | 'refuse',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/confirm`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ id: confirmId, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.reason || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur réseau' };
  }
}

export async function waitForCommandResult(
  commandId: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<{ ok: boolean; data?: any; error?: string; status: CommandResult['status']; awaitingConfirm?: boolean }> {
  const polled = await pollResult(commandId, onProgress);
  if (!polled.ok) {
    return { ok: false, error: polled.error, status: 'timeout' };
  }

  const payload = polled.data?.result ?? polled.data ?? {};
  if (payload?.awaiting_confirm === true) {
    return {
      ok: false,
      status: 'pending',
      awaitingConfirm: true,
      data: {
        command_id:      commandId,
        confirm_id:      payload.confirm_id,
        message:         payload.message || 'Confirmation requise',
        awaiting_confirm: true,
      },
      error: payload?.message || 'Confirmation requise',
    };
  }

  const success = payload?.success !== false;
  return {
    ok:     success,
    status: success ? 'success' : 'error',
    data:   payload,
    error:  success ? undefined : payload?.message,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  INTERFACE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────
export async function sendAndWait(
  command: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<{ ok: boolean; data?: any; error?: string; status: CommandResult['status']; awaitingConfirm?: boolean }> {
  onProgress?.('sending', 0);
  const sent = await postCommand(command);
  if (!sent.ok || !sent.id) {
    return { ok: false, error: sent.error || 'Échec d\'envoi.', status: 'error' };
  }
  onProgress?.('polling', 0);
  return waitForCommandResult(sent.id, onProgress);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────
export async function checkHealth(): Promise<{
  ok: boolean; online: boolean; data?: any; mode: BridgeMode; error?: string;
}> {
  const mode = ACTIVE_BRIDGE_MODE;
  try {
    const baseUrl = await getBaseUrl(true);
    const res = await fetch(`${baseUrl}/api/health`, { headers: buildHeaders() });
    if (!res.ok) return { ok: false, online: false, mode, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, online: true, data, mode };
  } catch (e: any) {
    return { ok: false, online: false, mode, error: e?.message || 'Bridge injoignable' };
  }
}

export async function getNotifications(limit: number = 20): Promise<{
  ok: boolean;
  notifications: BridgeNotification[];
  count: number;
  remaining: number;
  error?: string;
}> {
  try {
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/notifications?limit=${limit}`, {
      headers: buildHeaders(),
    });
    if (!res.ok) {
      return { ok: false, notifications: [], count: 0, remaining: 0, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      ok:            true,
      notifications: (data.notifications || []) as BridgeNotification[],
      count:         Number(data.count || 0),
      remaining:     Number(data.remaining || 0),
    };
  } catch (e: any) {
    return { ok: false, notifications: [], count: 0, remaining: 0, error: e?.message || 'Erreur réseau' };
  }
}

export function getCurrentMode(): string {
  if (ACTIVE_BRIDGE_MODE === 'azure') return `Azure Cloud — ${AZURE_URL}`;
  return `Local WiFi — ${_resolvedBaseUrl || BASE_URL_FALLBACK}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMANDE RAPIDE MUSIQUE — Semaine 4
//  Envoie une commande musique et retourne le résultat immédiatement
// ─────────────────────────────────────────────────────────────────────────────
export async function sendMusicCommand(command: string): Promise<{
  ok: boolean;
  message: string;
  data?: any;
}> {
  const result = await sendAndWait(command);
  const payload = result.data?.result ?? result.data ?? {};
  const message = payload?.message ?? result.error ?? (result.ok ? 'OK' : 'Erreur');
  return { ok: result.ok, message, data: payload };
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMANDE VOCALE
// ─────────────────────────────────────────────────────────────────────────────
export interface VoiceResult {
  ok:          boolean;
  transcript?: string;
  data?:       any;
  error?:      string;
}

export async function sendVoiceCommand(
  audioUri: string,
  onProgress?: (step: 'uploading' | 'executing') => void,
): Promise<VoiceResult> {
  try {
    onProgress?.('uploading');
    const response = await fetch(audioUri);
    const blob     = await response.blob();
    const base64   = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const format = audioUri.includes('.m4a')  ? 'm4a'
                 : audioUri.includes('.wav')  ? 'wav'
                 : audioUri.includes('.webm') ? 'webm'
                 : 'm4a';

    onProgress?.('executing');
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/voice`, {
      method:  'POST',
      headers: { ...buildHeaders(), 'Content-Type': 'application/json', 'X-Audio-Format': format },
      body:    JSON.stringify({ audio_base64: base64, format, device_id: DEVICE_ID, speak: false }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `HTTP ${res.status} — ${err}` };
    }
    const data = await res.json();
    return {
      ok:         data.success !== false,
      transcript: data.transcript,
      data,
      error:      data.success === false ? data.result?.message : undefined,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur réseau' };
  }
}