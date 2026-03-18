/**
 * VoiceScreen.tsx — Mode vocal Jarvis
 * SEMAINE 8 — Mardi/Mercredi
 *
 * Flux : Appui micro → Enregistrement → base64 → POST /api/voice
 *        → Whisper transcrit → Agent exécute → TTS répond sur PC
 *        → App affiche transcript + résultat
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, ScrollView, ActivityIndicator,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
// import * as FileSystem from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { useHistoryStore } from '../store/history.store';

// ── Config ────────────────────────────────────────────────────────────────────
import { BASE_URL_EXPORT } from '../services/api.service';
const BASE_URL     = BASE_URL_EXPORT;
const SECRET_TOKEN = 'menedona_2005_christoban_2026';
const DEVICE_ID    = 'NDZANA_PHONE';

function headers() {
  return {
    'Content-Type':   'application/json',
    'X-Jarvis-Token': SECRET_TOKEN,
    'X-Device-Id':    DEVICE_ID,
    'X-Timestamp':    Math.floor(Date.now() / 1000).toString(),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type VoiceStatus =
  | 'idle'
  | 'recording'
  | 'processing'   // envoi + Whisper
  | 'done'
  | 'error';

interface VoiceResult {
  transcript: string;
  response:   string;
  success:    boolean;
  timings?:   { whisper_ms: number; exec_ms: number; total_ms: number };
}

// ── Constantes visuelles ──────────────────────────────────────────────────────
const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle:       'Appuyez pour parler',
  recording:  'À l\'écoute...',
  processing: 'Traitement en cours...',
  done:       'Commande exécutée',
  error:      'Erreur — réessayez',
};

let _seq = 0;
const uid = () => `v_${Date.now()}_${++_seq}`;

// ── Composant principal ───────────────────────────────────────────────────────
export function VoiceScreen() {
  const [status,     setStatus]     = useState<VoiceStatus>('idle');
  const [result,     setResult]     = useState<VoiceResult | null>(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Animations
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;

  const { addPending, updateEntry } = useHistoryStore();

  // ── Animation micro ──────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'recording') {
      Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
          Animated.timing(glowAnim,  { toValue: 1,    duration: 700, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
          Animated.timing(glowAnim,  { toValue: 0.4, duration: 700, useNativeDriver: false }),
        ]),
      ])).start();
    } else {
      pulseAnim.stopAnimation(); pulseAnim.setValue(1);
      glowAnim.stopAnimation();  glowAnim.setValue(0);
    }
  }, [status]);

  // Fade résultat
  useEffect(() => {
    if (status === 'done' || status === 'error') {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [status, result]);

  // ── Enregistrement ────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setErrorMsg('Permission micro refusée.');
        setStatus('error');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setStatus('recording');
      setResult(null);
      setErrorMsg('');
      Vibration.vibrate(30);

    } catch (e: any) {
      setErrorMsg(e.message || 'Impossible de démarrer l\'enregistrement.');
      setStatus('error');
    }
  }

  async function stopAndSend() {
    if (!recorder.getStatus().isRecording) return;
    Vibration.vibrate(20);
    setStatus('processing');

    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

      const uri = recorder.uri ?? recorder.getStatus().url;

      if (!uri) throw new Error('Aucun fichier audio enregistré.');

      // Lire le fichier en base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Déterminer le format
      const fmt = uri.endsWith('.m4a') ? 'm4a'
                : uri.endsWith('.wav') ? 'wav'
                : uri.endsWith('.caf') ? 'caf'
                : 'm4a';

      // Enregistrer dans l'historique
      const histId = uid();
      addPending(histId, '[Commande vocale]');

      // Envoyer au bridge
      const res = await fetch(`${BASE_URL}/api/voice`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          audio_base64: base64Audio,
          format:       fmt,
          device_id:    DEVICE_ID,
          speak:        true,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const success    = data.success ?? false;
      const transcript = data.transcript ?? '';
      const response   = data.result?.message ?? '';

      updateEntry(histId, {
        status:   success ? 'done' : 'error',
        result:   `[Vocal] ${transcript} → ${response}`,
        duration_ms: data.timings?.total_ms,
      });

      setResult({ transcript, response, success, timings: data.timings });
      setStatus('done');

      Vibration.vibrate(success ? [0, 30, 50, 30] : [0, 80, 40, 80]);

      // Nettoyage fichier temporaire
      await FileSystem.deleteAsync(uri, { idempotent: true });

    } catch (e: any) {
      setErrorMsg(e.message || 'Erreur de traitement audio.');
      setStatus('error');
    }
  }

  function handlePress() {
    if (status === 'recording') {
      stopAndSend();
    } else if (status !== 'processing') {
      startRecording();
    }
  }

  const isRecording  = status === 'recording';
  const isProcessing = status === 'processing';

  const micBtnColor = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(0,229,255,0.12)', 'rgba(0,229,255,0.35)'],
  });

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── En-tête ── */}
        <View style={styles.header}>
          <Text style={styles.title}>MODE VOCAL</Text>
          <Text style={styles.subtitle}>Parlez — Jarvis exécute</Text>
        </View>

        {/* ── Bouton micro ── */}
        <View style={styles.micSection}>
          <Animated.View style={[styles.micGlow, { backgroundColor: micBtnColor }]}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.micBtn,
                  isRecording  && styles.micBtnActive,
                  isProcessing && styles.micBtnProcessing,
                ]}
                onPress={handlePress}
                disabled={isProcessing}
                activeOpacity={0.85}
              >
                {isProcessing ? (
                  <ActivityIndicator size="large" color={Colors.bg} />
                ) : (
                  <Text style={styles.micIcon}>
                    {isRecording ? '◼' : '🎤'}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          {/* Statut */}
          <Text style={[
            styles.statusLabel,
            isRecording  && { color: Colors.primary },
            status === 'error' && { color: Colors.error },
          ]}>
            {STATUS_LABEL[status]}
          </Text>

          {isRecording && (
            <Text style={styles.tapToStop}>Appuyez pour arrêter</Text>
          )}
        </View>

        {/* ── Résultat ── */}
        {(status === 'done' || status === 'error') && (
          <Animated.View style={[styles.resultSection, { opacity: fadeAnim }]}>

            {/* Transcript */}
            {result?.transcript ? (
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>VOUS AVEZ DIT</Text>
                <Text style={styles.transcriptText}>« {result.transcript} »</Text>
              </View>
            ) : null}

            {/* Réponse Jarvis */}
            {result ? (
              <View style={[
                styles.responseCard,
                result.success ? styles.responseSuccess : styles.responseError,
              ]}>
                <View style={styles.responseHeader}>
                  <Text style={styles.responseIcon}>
                    {result.success ? '✓' : '✗'}
                  </Text>
                  <Text style={[
                    styles.responseStatus,
                    result.success ? { color: Colors.success } : { color: Colors.error },
                  ]}>
                    {result.success ? 'EXÉCUTÉ' : 'ERREUR'}
                  </Text>
                  {result.timings && (
                    <Text style={styles.responseTiming}>
                      {result.timings.total_ms}ms
                    </Text>
                  )}
                </View>
                <Text style={styles.responseText}>{result.response}</Text>
                {result.timings && (
                  <Text style={styles.timingDetail}>
                    Whisper {result.timings.whisper_ms}ms · Exécution {result.timings.exec_ms}ms
                  </Text>
                )}
              </View>
            ) : null}

            {/* Erreur sans résultat */}
            {status === 'error' && !result && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Aide ── */}
        {status === 'idle' && (
          <View style={styles.hints}>
            <Text style={styles.hintsTitle}>EXEMPLES DE COMMANDES</Text>
            {[
              '"Ouvre Chrome"',
              '"Mets le volume à 70%"',
              '"Éteins l\'ordinateur dans 5 minutes"',
              '"Cherche les fichiers PDF"',
              '"Quelles applis sont ouvertes ?"',
            ].map(hint => (
              <Text key={hint} style={styles.hintItem}>› {hint}</Text>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MIC_SIZE = 100;

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.lg, alignItems: 'center', paddingBottom: Spacing.xxl },

  header: { alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  title: {
    color: Colors.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 6,
  },
  subtitle: {
    color: Colors.textSecondary, fontSize: 12, letterSpacing: 2, marginTop: Spacing.xs,
  },

  micSection: { alignItems: 'center', marginBottom: Spacing.xxl },

  micGlow: {
    width:        MIC_SIZE + 60,
    height:       MIC_SIZE + 60,
    borderRadius: (MIC_SIZE + 60) / 2,
    alignItems:   'center',
    justifyContent: 'center',
  },
  micBtn: {
    width:           MIC_SIZE,
    height:          MIC_SIZE,
    borderRadius:    MIC_SIZE / 2,
    backgroundColor: Colors.bgElevated,
    borderWidth:     2,
    borderColor:     Colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
    ...Shadow.cyan,
  },
  micBtnActive: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  micBtnProcessing: {
    backgroundColor: Colors.bgCard,
    borderColor:     Colors.textMuted,
  },
  micIcon: { fontSize: 36 },

  statusLabel: {
    color: Colors.textSecondary, fontSize: 14, letterSpacing: 2,
    marginTop: Spacing.lg, fontWeight: '600',
  },
  tapToStop: {
    color: Colors.textMuted, fontSize: 11, letterSpacing: 1,
    marginTop: Spacing.xs,
  },

  // Résultat
  resultSection: { width: '100%', gap: Spacing.md },

  transcriptCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  transcriptLabel: {
    color: Colors.textMuted, fontSize: 9, letterSpacing: 4, marginBottom: Spacing.xs,
  },
  transcriptText: {
    color: Colors.primary, fontSize: 16, fontStyle: 'italic', lineHeight: 24,
  },

  responseCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  responseSuccess: {
    backgroundColor: Colors.successBg, borderColor: 'rgba(0,230,118,0.3)',
  },
  responseError: {
    backgroundColor: Colors.errorBg, borderColor: 'rgba(255,23,68,0.3)',
  },
  responseHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  responseIcon: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  responseStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 3, flex: 1 },
  responseTiming: { color: Colors.textMuted, fontSize: 10 },
  responseText: {
    color: Colors.textPrimary, fontSize: 15, lineHeight: 22,
  },
  timingDetail: {
    color: Colors.textMuted, fontSize: 10, marginTop: Spacing.sm, letterSpacing: 1,
  },

  errorCard: {
    backgroundColor: Colors.errorBg, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.error, padding: Spacing.md,
  },
  errorText: { color: Colors.error, fontSize: 14 },

  // Aide
  hints: { width: '100%', gap: Spacing.sm },
  hintsTitle: {
    color: Colors.textMuted, fontSize: 9, letterSpacing: 4, marginBottom: Spacing.xs,
  },
  hintItem: {
    color: Colors.textSecondary, fontSize: 13, lineHeight: 22,
  },
});