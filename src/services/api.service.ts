/**
 * api.service.ts — Communication Mobile ↔ Jarvis PC
 *
 * MODE LOCAL  : téléphone + PC sur même WiFi → direct sans Azure
 * MODE CLOUD  : via Azure Function (Semaine 8)
 *
 * ⚙️  POUR CHANGER DE MODE :
 *     Modifie BRIDGE_MODE ci-dessous.
 *
 * En mode local, l'app tente de détecter automatiquement le bridge Jarvis.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  ⚙️  CONFIGURATION — À MODIFIER SELON TON ENVIRONNEMENT
// ─────────────────────────────────────────────────────────────────────────────

type BridgeMode = 'local' | 'azure';

// Choix rapide du mode de dev:
// - 'local'     : meme WiFi (detection auto IP + fallback)
// - 'azure'     : backend cloud Azure
const BRIDGE_MODE: BridgeMode = 'local';

// Optionnel: surcharge via variable Expo (EXPO_PUBLIC_BRIDGE_MODE=local|azure)
const BRIDGE_MODE_ENV = String(process?.env?.EXPO_PUBLIC_BRIDGE_MODE || '').trim().toLowerCase();
const ACTIVE_BRIDGE_MODE: BridgeMode =
  BRIDGE_MODE_ENV === 'local'
    ? 'local'
    : BRIDGE_MODE_ENV === 'azure'
      ? 'azure'
        : BRIDGE_MODE;

// Fallback manuel si la détection auto échoue
const LOCAL_PC_IP_FALLBACK = '10.183.57.205';

const LOCAL_PORT  = 7071;
const AZURE_URL   = 'https://jarvis-windows-fn.azurewebsites.net';

const BASE_URL_FALLBACK = `http://${LOCAL_PC_IP_FALLBACK}:${LOCAL_PORT}`;

let _resolvedBaseUrl: string | null = null;

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
    // import dynamique pour éviter les erreurs si Constants n'est pas dispo.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const hostUri: string | undefined =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoGo?.hostUri ||
      Constants?.manifest?.debuggerHost;

    if (!hostUri) return null;
    const host = String(hostUri).split(':')[0]?.trim();
    return host || null;
  } catch {
    return null;
  }
}

function getLocalCandidates(): string[] {
  const expoHostIp = extractExpoHostIp();
  const candidates = [
    expoHostIp ? `http://${expoHostIp}:${LOCAL_PORT}` : '',
    `http://${LOCAL_PC_IP_FALLBACK}:${LOCAL_PORT}`,
    `http://127.0.0.1:${LOCAL_PORT}`,
    `http://localhost:${LOCAL_PORT}`,
    // Android Emulator classique
    `http://10.0.2.2:${LOCAL_PORT}`,
  ];
  return dedupe(candidates.filter(Boolean));
}

async function probeBridge(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: buildHeaders(),
      signal: withTimeoutSignal(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getBaseUrl(forceRefresh = false): Promise<string> {
  if (ACTIVE_BRIDGE_MODE === 'azure') return AZURE_URL;

  // Mode local: détection auto (LAN)
  if (!forceRefresh && _resolvedBaseUrl) return _resolvedBaseUrl;

  const candidates = getLocalCandidates();
  for (const base of candidates) {
    // eslint-disable-next-line no-await-in-loop
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
  BASE_URL: ACTIVE_BRIDGE_MODE === 'azure'
    ? AZURE_URL
    : BASE_URL_FALLBACK,
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
  id: string;
  title: string;
  body: string;
  type: 'task_done' | 'error' | 'battery_low' | 'screenshot' | 'info' | string;
  priority: 'high' | 'normal' | 'low' | string;
  timestamp: number;
  data?: Record<string, any>;
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
      try {
        const data = await res.json();
        reason = typeof data?.reason === 'string' ? data.reason : '';
      } catch {
        reason = '';
      }
      return { ok: false, error: reason ? `HTTP ${res.status} — ${reason}` : `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, id: data.id || data.command_id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur réseau — PC injoignable.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ATTENDRE LE RÉSULTAT (POLLING)
// ─────────────────────────────────────────────────────────────────────────────
async function pollResult(
  id: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const start = Date.now();
  let attempt = 0;

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      // Timeout global : 30s
      if (Date.now() - start > 60_000) {
        clearInterval(timer);
        resolve({ ok: false, error: 'Timeout 30s — PC n\'a pas répondu.' });
        return;
      }

      attempt++;
      onProgress?.('polling', attempt);

      try {
        const baseUrl = await getBaseUrl();
        const res = await fetch(`${baseUrl}/api/result/${id}`, {
          headers: buildHeaders(),
        });

        // 404 = pas encore prêt, on continue
        if (res.status === 404) return;
        if (!res.ok)            return;

        const data = await res.json();

        // Le bridge local retourne immédiatement status:"done"
        // La vraie Azure Function retourne status:"pending" tant que le PC n'a pas répondu
        if (data.status === 'pending' && !data.result) return;

        clearInterval(timer);
        resolve({ ok: true, data });
      } catch {
        // Erreur réseau passagère — on continue à poller
      }
    }, 800);  // poll toutes les 1.2s
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
    return { ok: false, error: e?.message || 'Erreur reseau' };
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
        command_id: commandId,
        confirm_id: payload.confirm_id,
        message: payload.message || 'Confirmation requise',
        awaiting_confirm: true,
      },
      error: payload?.message || 'Confirmation requise',
    };
  }

  const success = payload?.success !== false;
  return {
    ok: success,
    status: success ? 'success' : 'error',
    data: payload,
    error: success ? undefined : payload?.message,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  INTERFACE PRINCIPALE — utilisée par useCommand.ts
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
//  HEALTH CHECK — utilisé par App.tsx + StatusBar
// ─────────────────────────────────────────────────────────────────────────────
export async function checkHealth(): Promise<{
  ok: boolean;
  online: boolean;
  data?: any;
  mode: BridgeMode;
  error?: string;
}> {
  const mode = ACTIVE_BRIDGE_MODE;
  try {
    const baseUrl = await getBaseUrl(true);
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: buildHeaders(),
    });
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
      return {
        ok: false,
        notifications: [],
        count: 0,
        remaining: 0,
        error: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      notifications: (data.notifications || []) as BridgeNotification[],
      count: Number(data.count || 0),
      remaining: Number(data.remaining || 0),
    };
  } catch (e: any) {
    return {
      ok: false,
      notifications: [],
      count: 0,
      remaining: 0,
      error: e?.message || 'Erreur reseau',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITAIRES
// ─────────────────────────────────────────────────────────────────────────────
export function getCurrentMode(): string {
  const active = _resolvedBaseUrl || BASE_URL_FALLBACK;
  if (ACTIVE_BRIDGE_MODE === 'azure') {
    return `Azure Cloud — ${AZURE_URL}`;
  }
  return `Local WiFi — ${active}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMANDE VOCALE — SEMAINE 8
//  Envoie un fichier audio au bridge, reçoit transcript + résultat
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

    // Lire le fichier audio et l'encoder en base64
    // (React Native : utiliser fetch sur file:// URI)
    const response = await fetch(audioUri);
    const blob     = await response.blob();

    // Convertir blob en base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => {
        const result = reader.result as string;
        // Enlever le préfixe data:audio/xxx;base64,
        resolve(result.split(',')[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Déterminer le format selon le platform
    const format = audioUri.includes('.m4a')  ? 'm4a'
                 : audioUri.includes('.wav')  ? 'wav'
                 : audioUri.includes('.webm') ? 'webm'
                 : 'm4a';  // défaut Expo iOS/Android

    onProgress?.('executing');

    // Envoyer au bridge
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/voice`, {
      method:  'POST',
      headers: {
        ...buildHeaders(),
        'Content-Type':   'application/json',
        'X-Audio-Format': format,
      },
      body: JSON.stringify({
        audio_base64: base64,
        format,
        device_id: DEVICE_ID,
        speak:     false,  // Le telephone prononcera la reponse
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Serveur: HTTP ${res.status} — ${err}` };
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
