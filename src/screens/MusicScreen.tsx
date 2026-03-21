/**
 * MusicScreen.tsx — Écran Musique Jarvis
 * Semaine 4
 *
 * Sections :
 *   1. Lecture en cours    — titre + contrôles (prev/pause/next/vol)
 *   2. Commandes rapides   — boutons pré-construits
 *   3. Recherche libre     — champ texte → commande MUSIC_PLAY
 *   4. Playlists           — liste + lecture en un tap
 *   5. Actions bibliothèque — scan, shuffle, recommande
 *
 * Toutes les actions passent par sendAndWait() → le PC exécute via MusicManager + VLC.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Vibration,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { sendMusicCommand, sendAndWait } from '../services/api.service';

// ── Types ─────────────────────────────────────────────────────────────────────
interface NowPlaying {
  title:     string;
  playing:   boolean;
  volume:    number;
}

interface Playlist {
  name:       string;
  count:      number;
  play_count: number;
}

type MusicStatus = 'idle' | 'loading' | 'done' | 'error';

// ── Commandes rapides ─────────────────────────────────────────────────────────
const QUICK_COMMANDS = [
  { label: '⏮',  hint: 'Précédent',  cmd: 'musique précédente',  color: '#00E5FF' },
  { label: '⏸',  hint: 'Pause',      cmd: 'pause la musique',    color: '#00E5FF' },
  { label: '⏭',  hint: 'Suivant',    cmd: 'musique suivante',    color: '#00E5FF' },
  { label: '🔀', hint: 'Aléatoire',  cmd: 'lecture aléatoire',   color: '#8B5CF6' },
  { label: '🔁', hint: 'Répéter',    cmd: 'répète cette musique', color: '#8B5CF6' },
  { label: '⏹',  hint: 'Stop',       cmd: 'arrête la musique',   color: '#FF1744' },
];

const VOLUME_STEPS = [
  { label: '20%', cmd: 'mets le volume à 20%' },
  { label: '50%', cmd: 'mets le volume à 50%' },
  { label: '70%', cmd: 'mets le volume à 70%' },
  { label: '100%', cmd: 'mets le volume à 100%' },
];

// ── Composant principal ───────────────────────────────────────────────────────
export function MusicScreen() {
  const [nowPlaying,   setNowPlaying]   = useState<NowPlaying | null>(null);
  const [playlists,    setPlaylists]    = useState<Playlist[]>([]);
  const [status,       setStatus]       = useState<MusicStatus>('idle');
  const [feedback,     setFeedback]     = useState('');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [refreshing,   setRefreshing]   = useState(false);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    _refreshState();
  }, []);

  // Animation pulse quand musique en cours
  useEffect(() => {
    if (nowPlaying?.playing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [nowPlaying?.playing]);

  // ── Rafraîchir l'état (musique en cours + playlists) ─────────────────────
  const _refreshState = useCallback(async () => {
    setRefreshing(true);
    try {
      // Récupérer la musique en cours
      const nowResult = await sendAndWait('quelle musique joue');
      if (nowResult.ok) {
        const d = nowResult.data?.result ?? nowResult.data ?? {};
        const current = d?.current ?? d?.data?.current;
        if (current) {
          setNowPlaying({
            title:   current,
            playing: d?.playing ?? d?.data?.playing ?? false,
            volume:  d?.volume ?? d?.data?.volume ?? 70,
          });
        } else {
          setNowPlaying(null);
        }
      }

      // Récupérer les playlists
      const plResult = await sendAndWait('liste mes playlists');
      if (plResult.ok) {
        const d = plResult.data?.result ?? plResult.data ?? {};
        const pls = d?.data?.playlists ?? d?.playlists ?? [];
        setPlaylists(pls);
      }
    } catch (e) {
      // Silencieux — pas bloquant
    } finally {
      setRefreshing(false);
    }
  }, []);

  // ── Exécuter une commande musique ─────────────────────────────────────────
  const _exec = useCallback(async (command: string, successMsg?: string) => {
    setStatus('loading');
    Vibration.vibrate(20);

    try {
      const result = await sendMusicCommand(command);

      // Flash feedback
      setFeedback(successMsg || result.message || (result.ok ? '✓' : '✗'));
      setStatus(result.ok ? 'done' : 'error');

      // Animer le feedback
      fadeAnim.setValue(1);
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        setStatus('idle');
        setFeedback('');
        fadeAnim.setValue(1);
      });

      // Rafraîchir l'état après les commandes de contrôle
      if (result.ok && ['pause', 'next', 'prev', 'stop', 'play', 'resume'].some(k => command.includes(k))) {
        setTimeout(_refreshState, 800);
      }

      Vibration.vibrate(result.ok ? [0, 20, 30, 20] : [0, 60, 30, 60]);
    } catch (e: any) {
      setFeedback('Erreur réseau');
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setFeedback(''); }, 2000);
    }
  }, [fadeAnim, _refreshState]);

  // ── Recherche musicale ────────────────────────────────────────────────────
  const _search = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchQuery('');
    await _exec(`joue la musique ${q}`, `Lecture : ${q}`);
  }, [searchQuery, _exec]);

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const isLoading = status === 'loading';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={_refreshState} tintColor={Colors.primary} />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>🎵 MUSIQUE</Text>
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => _exec('analyse mon dossier musique', 'Bibliothèque scannée')}
            disabled={isLoading}
          >
            <Text style={styles.scanBtnText}>SCANNER</Text>
          </TouchableOpacity>
        </View>

        {/* ── Feedback global ── */}
        {status !== 'idle' && (
          <Animated.View style={[
            styles.feedbackBanner,
            status === 'error' && styles.feedbackError,
            { opacity: fadeAnim },
          ]}>
            {isLoading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={[styles.feedbackText, status === 'error' && { color: Colors.error }]}>
                  {feedback}
                </Text>
            }
          </Animated.View>
        )}

        {/* ── Lecture en cours ── */}
        <Animated.View style={[styles.nowPlayingCard, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.nowPlayingLeft}>
            <Text style={styles.nowPlayingLabel}>EN COURS</Text>
            <Text style={styles.nowPlayingTitle} numberOfLines={2}>
              {nowPlaying?.title || '— Aucune musique —'}
            </Text>
            {nowPlaying && (
              <Text style={styles.nowPlayingState}>
                {nowPlaying.playing ? '▶ Lecture' : '⏸ Pause'} · Vol {nowPlaying.volume}%
              </Text>
            )}
          </View>
          <View style={styles.nowPlayingIcon}>
            <Text style={{ fontSize: 36 }}>{nowPlaying?.playing ? '🎵' : '🎶'}</Text>
          </View>
        </Animated.View>

        {/* ── Contrôles rapides ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CONTRÔLES</Text>
          <View style={styles.controlsGrid}>
            {QUICK_COMMANDS.map((qc) => (
              <TouchableOpacity
                key={qc.cmd}
                style={[styles.controlBtn, { borderColor: qc.color + '40' }]}
                onPress={() => _exec(qc.cmd)}
                disabled={isLoading}
                activeOpacity={0.75}
              >
                <Text style={[styles.controlIcon, { color: qc.color }]}>{qc.label}</Text>
                <Text style={styles.controlHint}>{qc.hint}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Volume ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>VOLUME</Text>
          <View style={styles.volumeRow}>
            {VOLUME_STEPS.map((v) => (
              <TouchableOpacity
                key={v.cmd}
                style={styles.volumeBtn}
                onPress={() => _exec(v.cmd)}
                disabled={isLoading}
                activeOpacity={0.75}
              >
                <Text style={styles.volumeText}>{v.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Recherche ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>JOUER UNE MUSIQUE</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={_search}
              placeholder="Titre, artiste..."
              placeholderTextColor={Colors.textMuted}
              returnKeyType="send"
              editable={!isLoading}
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.searchBtn, (!searchQuery.trim() || isLoading) && styles.searchBtnOff]}
              onPress={_search}
              disabled={!searchQuery.trim() || isLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.searchBtnIcon}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* Suggestions rapides */}
          <View style={styles.suggestionsRow}>
            {['Lofi', 'Gospel', 'Aléatoire'].map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionChip}
                onPress={() => {
                  if (s === 'Aléatoire') {
                    _exec('joue une musique au hasard', 'Musique aléatoire...');
                  } else {
                    _exec(`joue les musiques ${s}`, `${s}...`);
                  }
                }}
                disabled={isLoading}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Playlists ── */}
        {playlists.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>PLAYLISTS</Text>
              <TouchableOpacity onPress={() => _exec('crée playlist nouvelle', 'Playlist créée')}>
                <Text style={styles.sectionAction}>+ CRÉER</Text>
              </TouchableOpacity>
            </View>
            {playlists.map((pl) => (
              <TouchableOpacity
                key={pl.name}
                style={styles.playlistItem}
                onPress={() => _exec(`joue la playlist ${pl.name}`, `▶ ${pl.name}`)}
                disabled={isLoading}
                activeOpacity={0.75}
              >
                <View style={styles.playlistLeft}>
                  <Text style={styles.playlistIcon}>♫</Text>
                  <View>
                    <Text style={styles.playlistName}>{pl.name}</Text>
                    <Text style={styles.playlistMeta}>
                      {pl.count} titre{pl.count !== 1 ? 's' : ''}
                      {pl.play_count > 0 ? ` · ${pl.play_count} écoute${pl.play_count !== 1 ? 's' : ''}` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.playlistPlay}>▶</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Actions avancées ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIONS</Text>
          <View style={styles.actionsGrid}>
            {[
              { label: 'Recommande-moi\nune musique', cmd: 'propose moi une musique', icon: '💡' },
              { label: 'Combien de\nmusiques ?',     cmd: 'combien de musiques j\'ai', icon: '📊' },
              { label: 'Ma musique\nla plus jouée',  cmd: 'quelle est ma musique la plus jouée', icon: '🏆' },
            ].map((a) => (
              <TouchableOpacity
                key={a.cmd}
                style={styles.actionBtn}
                onPress={() => _exec(a.cmd)}
                disabled={isLoading}
                activeOpacity={0.75}
              >
                <Text style={styles.actionIcon}>{a.icon}</Text>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: Colors.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 4,
  },
  scanBtn: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  scanBtnText: {
    color: Colors.primary, fontSize: 10, fontWeight: '700', letterSpacing: 2,
  },

  // Feedback
  feedbackBanner: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm,
  },
  feedbackError: { borderColor: Colors.error, backgroundColor: Colors.errorBg },
  feedbackText: { color: Colors.textPrimary, fontSize: 13 },

  // Now Playing
  nowPlayingCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '40',
    padding: Spacing.lg,
    flexDirection: 'row', alignItems: 'center',
    ...Shadow.cyan,
  },
  nowPlayingLeft: { flex: 1 },
  nowPlayingLabel: {
    color: Colors.primary, fontSize: 9, fontWeight: '700', letterSpacing: 4,
    marginBottom: Spacing.xs,
  },
  nowPlayingTitle: {
    color: Colors.textPrimary, fontSize: 18, fontWeight: '700', lineHeight: 24,
  },
  nowPlayingState: {
    color: Colors.textSecondary, fontSize: 11, marginTop: Spacing.xs, letterSpacing: 1,
  },
  nowPlayingIcon: { marginLeft: Spacing.md },

  // Section
  section: { gap: Spacing.sm },
  sectionLabel: {
    color: Colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 4,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sectionAction: {
    color: Colors.primary, fontSize: 9, fontWeight: '700', letterSpacing: 2,
  },

  // Controls
  controlsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },
  controlBtn: {
    flex: 1, minWidth: '28%',
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm, alignItems: 'center', gap: 4,
  },
  controlIcon: { fontSize: 22 },
  controlHint: { color: Colors.textMuted, fontSize: 9, letterSpacing: 1 },

  // Volume
  volumeRow: { flexDirection: 'row', gap: Spacing.sm },
  volumeBtn: {
    flex: 1, backgroundColor: Colors.bgCard,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center',
  },
  volumeText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },

  // Search
  searchRow: { flexDirection: 'row', gap: Spacing.sm },
  searchInput: {
    flex: 1, backgroundColor: Colors.bgCard,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.textPrimary, fontSize: 14,
  },
  searchBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnOff: { backgroundColor: Colors.bgElevated },
  searchBtnIcon: { color: Colors.bg, fontSize: 16, fontWeight: '700' },

  // Suggestions
  suggestionsRow: { flexDirection: 'row', gap: Spacing.sm },
  suggestionChip: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  suggestionText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },

  // Playlists
  playlistItem: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  playlistLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  playlistIcon: { fontSize: 20, color: Colors.primary },
  playlistName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  playlistMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  playlistPlay: { color: Colors.primary, fontSize: 18, fontWeight: '700' },

  // Actions
  actionsGrid: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: {
    flex: 1, backgroundColor: Colors.bgCard,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, alignItems: 'center', gap: Spacing.xs,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: {
    color: Colors.textSecondary, fontSize: 10, textAlign: 'center', lineHeight: 15,
  },
});