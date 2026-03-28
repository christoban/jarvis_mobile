/**
 * ScreenShareScreen.tsx — Affichage du bureau PC en temps réel
 * =============================================================
 * Semaine 9 — Screen Share
 *
 * Architecture :
 *   - Polling HTTP vers jarvis_bridge.py GET /api/screen/frame
 *     (pas de WebSocket natif React Native sans lib — polling optimisé à la place)
 *   - Polling différentiel : envoie le frame_id courant → le bridge ne renvoie
 *     rien si le frame n'a pas changé (économise la bande passante)
 *   - Affichage via <Image source={{uri: `data:image/jpeg;base64,...`}} />
 *   - Stats overlay : FPS réel, taille frame, résolution, qualité
 *   - Contrôles : start/stop, qualité +/-, pinch-to-zoom
 *   - Mode paysage supporté (useWindowDimensions)
 *
 * Intégration dans le navigateur :
 *   Dans App.tsx ou Navigator, ajoute :
 *     import { ScreenShareScreen } from './screens/ScreenShareScreen';
 *     <Tab.Screen name="Screen" component={ScreenShareScreen}
 *                 options={{ title: 'Bureau PC' }} />
 *
 * Config requise dans api.service.ts ou constants :
 *   export const LOCAL_PC_IP = '192.168.1.X';   ← IP de ton PC
 *   export const BRIDGE_PORT = 7071;
 *   export const SECRET_TOKEN = 'ton_token';
 */

import React, {
  useCallback, useEffect, useRef, useState, useMemo,
} from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Platform, Alert,
  useWindowDimensions, StatusBar, Vibration,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Imports thème (mêmes conventions que HomeScreen.tsx) ─────────────────────
import { Colors, Spacing, Radius, Shadow } from '../theme';

// ── Config réseau ─────────────────────────────────────────────────────────────
// Importe depuis tes constantes existantes ou définis ici
let LOCAL_PC_IP   = '192.168.1.100';
let BRIDGE_PORT   = 7071;
let SECRET_TOKEN  = 'changeme';

try {
  const cfg = require('../constants');
  if (cfg.LOCAL_PC_IP)  LOCAL_PC_IP  = cfg.LOCAL_PC_IP;
  if (cfg.BRIDGE_PORT)  BRIDGE_PORT  = cfg.BRIDGE_PORT;
  if (cfg.SECRET_TOKEN) SECRET_TOKEN = cfg.SECRET_TOKEN;
} catch (_) {}

const BASE_URL  = `http://${LOCAL_PC_IP}:${BRIDGE_PORT}`;
const HEADERS   = { 'X-Jarvis-Token': SECRET_TOKEN, 'X-Device-Id': 'mobile' };

// ── Types ─────────────────────────────────────────────────────────────────────
interface FrameInfo {
  frameId:   number;
  frameUrl:  string;
  width:     number;
  height:    number;
  sizeKb:    number;
  ageMs:     number;
  fpsReal:   number;
  quality:   number;
}

interface CaptureStats {
  running:     boolean;
  fpsTarget:   number;
  fpsReal:     number;
  quality:     number;
  totalFrames: number;
  lastSizeKb:  number;
  bwKbps:      number;
  uptimeS:     number;
}

type StreamState = 'idle' | 'starting' | 'streaming' | 'paused' | 'error';

// ── Constantes ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS      = 100;    // 10 polls/s max → adapter selon FPS cible
const STATS_REFRESH_MS      = 1000;   // Refresh stats overlay
const MAX_CONSECUTIVE_FAILS = 5;      // Arrêt auto si trop d'erreurs
const DEFAULT_FPS           = 10;
const DEFAULT_QUALITY       = 60;
const QUALITY_STEPS         = [20, 35, 50, 60, 70, 80, 90];
const FPS_STEPS             = [1, 3, 5, 10, 15, 20];

// ══════════════════════════════════════════════════════════════════════════════
//  Composant principal
// ══════════════════════════════════════════════════════════════════════════════

export function ScreenShareScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;

  // ── State ──────────────────────────────────────────────────────────────────
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [currentFrame, setCurrentFrame] = useState<FrameInfo | null>(null);
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [error, setError] = useState<string>('');
  const [showStats, setShowStats] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [targetFps, setTargetFps] = useState(DEFAULT_FPS);
  const [targetQuality, setTargetQuality] = useState(DEFAULT_QUALITY);
  const [zoom, setZoom] = useState(1.0);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const pollTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIdRef   = useRef(-1);
  const failsRef     = useRef(0);
  const isPolling    = useRef(false);

  // ── Computed ───────────────────────────────────────────────────────────────
  // Dimensions de l'image en respectant le ratio
  const imageStyle = useMemo(() => {
    if (!currentFrame) return { width: screenW, height: 200 };
    const ratio    = currentFrame.height / currentFrame.width;
    const maxW     = screenW;
    const maxH     = isLandscape ? screenH - 80 : screenH * 0.55;
    let imgW = maxW * zoom;
    let imgH = imgW * ratio;
    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH / ratio;
    }
    return { width: imgW, height: imgH };
  }, [currentFrame, screenW, screenH, isLandscape, zoom]);

  // ── API helpers ────────────────────────────────────────────────────────────
  const apiPost = useCallback(async (path: string, body: object = {}) => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method:  'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }, []);

  const apiGet = useCallback(async (path: string) => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: HEADERS,
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }, []);

  // ── Démarrer le stream ────────────────────────────────────────────────────
  const startStream = useCallback(async () => {
    setStreamState('starting');
    setError('');
    frameIdRef.current = -1;
    failsRef.current   = 0;

    const res = await apiPost('/api/stream/start', {
      fps:     targetFps,
      quality: targetQuality,
      scale:   1.0,
      monitor: 1,
    });

    if (!res.success) {
      setStreamState('error');
      setError(res.message || 'Impossible de démarrer la capture.');
      return;
    }

    Vibration.vibrate(30);
    setStreamState('streaming');
    _startPolling();
    _startStatsRefresh();
  }, [targetFps, targetQuality, apiPost]);

  // ── Arrêter le stream ─────────────────────────────────────────────────────
  const stopStream = useCallback(async () => {
    _stopPolling();
    _stopStatsRefresh();
    setStreamState('idle');
    setCurrentFrame(null);
    frameIdRef.current = -1;
    Vibration.vibrate(30);
    await apiPost('/api/stream/stop');
  }, [apiPost]);

  // ── Pause / Resume ────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (streamState === 'streaming') {
      _stopPolling();
      setStreamState('paused');
    } else if (streamState === 'paused') {
      setStreamState('streaming');
      _startPolling();
    }
  }, [streamState]);

  // ── Polling de frames ─────────────────────────────────────────────────────
  const _pollFrame = useCallback(async () => {
    if (isPolling.current) return;
    isPolling.current = true;

    try {
      const sinceId = frameIdRef.current;
      const path    = `/api/stream/frame?since_id=${sinceId}`;
      const res     = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });

      if (!res.ok) {
        failsRef.current++;
        if (failsRef.current >= MAX_CONSECUTIVE_FAILS) {
          setStreamState('error');
          setError(`Connexion perdue (${failsRef.current} erreurs consécutives)`);
          _stopPolling();
        }
        return;
      }

      const data = await res.json();
      failsRef.current = 0;  // Reset sur succès

      if (data.status === 'same_frame') {
        return;  // Pas de nouveau frame, rien à faire
      }

      if (data.status === 'no_stream' || data.status === 'stale') {
        setError(data.message || 'Stream inactif');
        setStreamState('error');
        _stopPolling();
        return;
      }

      // Nouveau frame disponible
      frameIdRef.current = data.frame_id;
      setCurrentFrame({
        frameId:  data.frame_id,
        frameUrl: `${BASE_URL}/api/stream/frame?format=jpeg&_t=${data.frame_id}`,
        width:    data.width   || 1920,
        height:   data.height  || 1080,
        sizeKb:   data.size_kb || 0,
        ageMs:    data.age_ms  || 0,
        fpsReal:  data.fps_real || 0,
        quality:  data.quality  || targetQuality,
      });

    } catch (e: any) {
      failsRef.current++;
      if (failsRef.current >= MAX_CONSECUTIVE_FAILS) {
        setStreamState('error');
        setError(`Connexion perdue : ${e.message}`);
        _stopPolling();
      }
    } finally {
      isPolling.current = false;
    }
  }, [targetQuality]);

  const _startPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    // Adapter l'intervalle de polling au FPS cible
    const interval = Math.max(50, Math.round(1000 / targetFps));
    pollTimer.current = setInterval(_pollFrame, interval);
  }, [_pollFrame, targetFps]);

  const _stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // ── Refresh stats ─────────────────────────────────────────────────────────
  const _startStatsRefresh = useCallback(() => {
    if (statsTimer.current) clearInterval(statsTimer.current);
    statsTimer.current = setInterval(async () => {
      const res = await apiGet('/api/stream/status');
      if (res.success && res.data) {
        setStats({
          running:     res.data.running,
          fpsTarget:   res.data.fps_target,
          fpsReal:     res.data.fps_real,
          quality:     res.data.quality,
          totalFrames: res.data.total_frames,
          lastSizeKb:  res.data.last_size_kb,
          bwKbps:      res.data.bw_kbps,
          uptimeS:     res.data.uptime_s,
        });
      }
    }, STATS_REFRESH_MS);
  }, [apiGet]);

  const _stopStatsRefresh = useCallback(() => {
    if (statsTimer.current) {
      clearInterval(statsTimer.current);
      statsTimer.current = null;
    }
  }, []);

  // ── Changer config FPS/qualité ────────────────────────────────────────────
  const applyConfig = useCallback(async (fps: number, quality: number) => {
    await apiPost('/api/stream/config', { fps, quality });
  }, [apiPost]);

  const cycleFps = useCallback(() => {
    const idx = FPS_STEPS.indexOf(targetFps);
    const next = FPS_STEPS[(idx + 1) % FPS_STEPS.length];
    setTargetFps(next);
    if (streamState === 'streaming') {
      applyConfig(next, targetQuality);
      _startPolling();  // Reconfigurer l'intervalle
    }
  }, [targetFps, targetQuality, streamState, applyConfig, _startPolling]);

  const cycleQuality = useCallback(() => {
    const idx  = QUALITY_STEPS.indexOf(targetQuality);
    const next = QUALITY_STEPS[(idx + 1) % QUALITY_STEPS.length];
    setTargetQuality(next);
    if (streamState === 'streaming') {
      applyConfig(targetFps, next);
    }
  }, [targetQuality, targetFps, streamState, applyConfig]);

  // ── Cycle zoom ────────────────────────────────────────────────────────────
  const cycleZoom = useCallback(() => {
    setZoom(z => {
      if (z >= 1.5) return 0.75;
      if (z >= 1.0) return 1.5;
      return 1.0;
    });
  }, []);

  // ── Cleanup au démontage ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      _stopPolling();
      _stopStatsRefresh();
    };
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────
  const fmtUptime = (s: number) => {
    if (s < 60)  return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${Math.floor(s / 3600)}h${Math.round((s % 3600) / 60)}m`;
  };

  const fpsColor = (fps: number, target: number) => {
    const ratio = fps / target;
    if (ratio >= 0.85) return Colors.success;
    if (ratio >= 0.5)  return '#F5A623';
    return Colors.error;
  };

  // ════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.statusDot, {
            backgroundColor:
              streamState === 'streaming' ? Colors.success :
              streamState === 'paused'    ? '#F5A623' :
              streamState === 'error'     ? Colors.error :
              Colors.textMuted,
          }]} />
          <Text style={s.headerTitle}>BUREAU PC</Text>
          {streamState === 'streaming' && stats && (
            <Text style={[s.fpsBadge, { color: fpsColor(stats.fpsReal, stats.fpsTarget) }]}>
              {stats.fpsReal} fps
            </Text>
          )}
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={() => setShowStats(v => !v)} style={s.iconBtn}>
            <Text style={s.iconBtnText}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowControls(v => !v)} style={s.iconBtn}>
            <Text style={s.iconBtnText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, isLandscape && s.contentLandscape]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Zone image ── */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={cycleZoom}
          onLongPress={() => setShowControls(v => !v)}
          style={[s.imageContainer, { height: imageStyle.height + 4 }]}
        >
          {currentFrame ? (
            <Image
              source={{ uri: currentFrame.frameUrl, headers: HEADERS }}
              style={[s.screenImage, imageStyle]}
              resizeMode="contain"
              fadeDuration={0}
            />
          ) : (
            <View style={[s.placeholder, { height: isLandscape ? 200 : 220 }]}>
              {streamState === 'starting' ? (
                <>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={s.placeholderText}>Connexion au PC...</Text>
                </>
              ) : streamState === 'error' ? (
                <>
                  <Text style={s.placeholderIcon}>⚠</Text>
                  <Text style={[s.placeholderText, { color: Colors.error }]}>{error}</Text>
                </>
              ) : (
                <>
                  <Text style={s.placeholderIcon}>🖥</Text>
                  <Text style={s.placeholderText}>Appuie sur DÉMARRER pour voir ton bureau</Text>
                  <Text style={s.placeholderSub}>PC : {LOCAL_PC_IP}:{BRIDGE_PORT}</Text>
                </>
              )}
            </View>
          )}

          {/* Overlay info frame */}
          {currentFrame && (
            <View style={s.frameOverlay}>
              <Text style={s.frameOverlayText}>
                #{currentFrame.frameId} · {currentFrame.sizeKb}KB · {currentFrame.ageMs}ms
              </Text>
            </View>
          )}

          {/* Badge PAUSED */}
          {streamState === 'paused' && (
            <View style={s.pausedBadge}>
              <Text style={s.pausedText}>⏸ PAUSE</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Stats overlay ── */}
        {showStats && stats && streamState === 'streaming' && (
          <View style={s.statsCard}>
            <View style={s.statsRow}>
              <StatPill
                label="FPS"
                value={`${stats.fpsReal}/${stats.fpsTarget}`}
                color={fpsColor(stats.fpsReal, stats.fpsTarget)}
              />
              <StatPill label="Qualité"  value={`${stats.quality}%`}    color={Colors.primary} />
              <StatPill label="Frame"    value={`${stats.lastSizeKb}KB`} color={Colors.textSecondary} />
              <StatPill label="BW"       value={`${stats.bwKbps}KB/s`}  color={Colors.textSecondary} />
            </View>
            <View style={s.statsRow}>
              <StatPill label="Frames"   value={`${stats.totalFrames}`}       color={Colors.textMuted} />
              <StatPill label="Uptime"   value={fmtUptime(stats.uptimeS)}     color={Colors.textMuted} />
              {currentFrame && (
                <StatPill label="Résol."
                  value={`${currentFrame.width}×${currentFrame.height}`}
                  color={Colors.textMuted}
                />
              )}
              <StatPill label="Zoom"   value={`×${zoom.toFixed(2)}`} color={Colors.textMuted} />
            </View>
          </View>
        )}

        {/* ── Contrôles ── */}
        {showControls && (
          <View style={s.controls}>

            {/* Ligne 1 : Start / Pause / Stop */}
            <View style={s.controlRow}>
              {streamState === 'idle' || streamState === 'error' ? (
                <ControlBtn
                  label="▶ DÉMARRER"
                  onPress={startStream}
                  primary
                  fullWidth
                />
              ) : (
                <>
                  <ControlBtn
                    label={streamState === 'paused' ? '▶ REPRENDRE' : '⏸ PAUSE'}
                    onPress={togglePause}
                    style={{ flex: 1 }}
                  />
                  <ControlBtn
                    label="⏹ STOP"
                    onPress={stopStream}
                    danger
                    style={{ flex: 1 }}
                  />
                </>
              )}
            </View>

            {/* Ligne 2 : FPS + Qualité + Zoom */}
            <View style={s.controlRow}>
              <ControlBtn
                label={`FPS: ${targetFps}`}
                onPress={cycleFps}
                style={{ flex: 1 }}
                small
              />
              <ControlBtn
                label={`Qual: ${targetQuality}%`}
                onPress={cycleQuality}
                style={{ flex: 1 }}
                small
              />
              <ControlBtn
                label={`Zoom ×${zoom.toFixed(1)}`}
                onPress={cycleZoom}
                style={{ flex: 1 }}
                small
              />
            </View>

            {/* Ligne 3 : Config info */}
            <View style={s.configInfo}>
              <Text style={s.configInfoText}>
                PC : {LOCAL_PC_IP}:{BRIDGE_PORT}
              </Text>
              {streamState === 'streaming' && (
                <Text style={[s.configInfoText, { color: Colors.success }]}>
                  ● Stream actif
                </Text>
              )}
            </View>

          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sous-composants
// ══════════════════════════════════════════════════════════════════════════════

function StatPill({
  label, value, color,
}: { label: string; value: string; color: string }) {
  return (
    <View style={sp.pill}>
      <Text style={sp.label}>{label}</Text>
      <Text style={[sp.value, { color }]}>{value}</Text>
    </View>
  );
}

function ControlBtn({
  label, onPress, primary = false, danger = false, small = false,
  fullWidth = false, style,
}: {
  label: string;
  onPress: () => void;
  primary?:   boolean;
  danger?:    boolean;
  small?:     boolean;
  fullWidth?: boolean;
  style?:     object;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        cb.btn,
        primary   && cb.primary,
        danger    && cb.danger,
        small     && cb.small,
        fullWidth && cb.full,
        style,
      ]}
    >
      <Text style={[cb.text, primary && cb.textPrimary, small && cb.textSmall]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Styles
// ══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  contentLandscape: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },
  fpsBadge: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  iconBtn:     { padding: Spacing.xs + 2 },
  iconBtnText: { fontSize: 16 },

  // Image
  imageContainer: {
    backgroundColor: '#000',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  screenImage: { backgroundColor: '#000' },

  placeholder: {
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing.md, width: '100%',
  },
  placeholderIcon: { fontSize: 56, opacity: 0.3 },
  placeholderText: {
    fontSize: 15, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  placeholderSub: {
    fontSize: 11, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Frame overlay info
  frameOverlay: {
    position: 'absolute', bottom: 6, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  frameOverlayText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Paused badge
  pausedBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8,
  },
  pausedText: { color: '#F5A623', fontSize: 16, fontWeight: '700', letterSpacing: 2 },

  // Stats card
  statsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.xs },

  // Controls
  controls: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  controlRow: { flexDirection: 'row', gap: Spacing.sm },
  configInfo: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  configInfoText: { fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
});

// StatPill styles
const sp = StyleSheet.create({
  pill: {
    flex: 1, alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm, paddingVertical: 4, paddingHorizontal: 6,
  },
  label: { fontSize: 8, color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  value: { fontSize: 11, fontWeight: '600', marginTop: 1 },
});

// ControlBtn styles
const cb = StyleSheet.create({
  btn: {
    borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    alignItems: 'center', justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  danger:  { borderColor: Colors.error, backgroundColor: Colors.errorBg },
  small:   { paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.sm },
  full:    { width: '100%' },
  text:    { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  textPrimary: { color: Colors.bg },
  textSmall:   { fontSize: 11 },
});