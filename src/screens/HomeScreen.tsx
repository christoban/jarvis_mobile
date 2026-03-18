/**
 * HomeScreen.tsx — Écran principal : envoyer une commande + voir le résultat
 * SEMAINE 7 — Mardi/Jeudi
 *
 * UI :  logo + statut PC + zone résultat animée + champ commande
 * UX :  réponse immédiate dans un "terminal card" + feedback haptic
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated,
  Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { PcStatusBar }   from '../components/StatusBar';
import { CommandInput }  from '../components/CommandInput';
import { useCommand }    from '../hooks/useCommand';
import { speak } from '../utils/tts';

export function HomeScreen() {
  const { status, lastResult, lastError, pendingConfirmation, send, resolveConfirmation } = useCommand();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Animation d'entrée du résultat
  useEffect(() => {
    if (status === 'done' || status === 'error') {
      fadeAnim.setValue(0);
      slideAnim.setValue(16);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
      
      if (status === 'done' && lastResult) speak(lastResult);
    }
  }, [status, lastResult, lastError]);

  useEffect(() => {
    if (!pendingConfirmation) return;
    Alert.alert(
      'Confirmation requise',
      pendingConfirmation.message,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolveConfirmation('refuse') },
        { text: 'Confirmer', style: 'destructive', onPress: () => resolveConfirmation('confirm') },
      ],
      { cancelable: false }
    );
  }, [pendingConfirmation, resolveConfirmation]);

  const isLoading  = status === 'sending' || status === 'polling';
  const hasResult  = status === 'done' || status === 'error';
  const isError    = status === 'error';

  const statusLabel = {
    idle:      '',
    sending:   '⟳ Envoi en cours...',
    polling:   '⟳ En attente du PC...',
    done:      '',
    error:     '',
  }[status];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.logoJ}>J</Text>
          <View>
            <Text style={styles.logoTitle}>JARVIS</Text>
            <Text style={styles.logoSub}>PC CONTROL</Text>
          </View>
        </View>

        {/* ── Statut PC ── */}
        <View style={styles.statusRow}>
          <PcStatusBar />
        </View>

        {/* ── Zone résultat ── */}
        {isLoading && (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingDots}>···</Text>
            <Text style={styles.loadingLabel}>{statusLabel}</Text>
          </View>
        )}

        {hasResult && (
          <Animated.View
            style={[
              styles.resultCard,
              isError ? styles.resultCardError : styles.resultCardSuccess,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>{isError ? '✕' : '✓'}</Text>
              <Text style={[styles.resultStatus, isError && styles.resultStatusError]}>
                {isError ? 'ERREUR' : 'EXÉCUTÉ'}
              </Text>
            </View>
            <Text style={[styles.resultText, isError && styles.resultTextError]}>
              {isError ? lastError : lastResult}
            </Text>
          </Animated.View>
        )}

        {/* ── Placeholder vide ── */}
        {status === 'idle' && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⌨</Text>
            <Text style={styles.emptyText}>
              Tapez une commande pour contrôler votre PC
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ── Input épinglé en bas ── */}
      <View style={styles.inputArea}>
        <CommandInput
          onSend={send}
          loading={isLoading}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  logoJ: {
    fontSize: 52, fontWeight: '800', color: Colors.primary,
    lineHeight: 56,
    textShadowColor: Colors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  logoTitle: {
    fontSize: 26, fontWeight: '800', color: Colors.textPrimary,
    letterSpacing: 8,
  },
  logoSub: {
    fontSize: 11, fontWeight: '600', color: Colors.textSecondary,
    letterSpacing: 4,
  },

  // Statut
  statusRow: { alignItems: 'flex-start' },

  // Loading
  loadingCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center', gap: Spacing.sm,
  },
  loadingDots: {
    fontSize: 32, color: Colors.primary,
    letterSpacing: 8,
  },
  loadingLabel: {
    fontSize: 13, color: Colors.textSecondary, letterSpacing: 1,
  },

  // Résultat
  resultCard: {
    borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.lg, gap: Spacing.sm,
    ...Shadow.card,
  },
  resultCardSuccess: {
    backgroundColor: Colors.successBg, borderColor: Colors.success,
  },
  resultCardError: {
    backgroundColor: Colors.errorBg, borderColor: Colors.error,
  },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  resultIcon: {
    fontSize: 16, color: Colors.success, fontWeight: '700',
  },
  resultStatus: {
    fontSize: 11, fontWeight: '700', color: Colors.success, letterSpacing: 2,
  },
  resultStatusError: { color: Colors.error },
  resultText: {
    fontSize: 15, color: Colors.textPrimary, lineHeight: 22,
  },
  resultTextError: { color: Colors.error },

  // Empty
  emptyState: {
    alignItems: 'center', gap: Spacing.md,
    paddingTop: Spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48, opacity: 0.2,
  },
  emptyText: {
    fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22,
  },

  // Input area
  inputArea: {
    backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    padding: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.md,
  },
});
