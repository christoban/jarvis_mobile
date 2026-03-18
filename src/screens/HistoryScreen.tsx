/**
 * HistoryScreen.tsx — Historique des commandes envoyées
 * SEMAINE 7 — Vendredi
 *
 * Liste chronologique (plus récent en haut) :
 *  - La commande tapée
 *  - Le résultat retourné par le PC
 *  - Le statut (done / error / pending)
 *  - La durée d'exécution
 *  - Le timestamp
 */

import React from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect }    from '@react-navigation/native';
import { format }            from 'date-fns';
import { fr }                from 'date-fns/locale';
import { Colors, Spacing, Radius, Shadow } from '../theme';

import { useHistoryStore, HistoryEntry, CommandStatus } from '../store/history.store';
import { useNotificationsStore } from '../store/notifications.store';
import { BridgeNotification } from '../services/api.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CommandStatus, { label: string; color: string; bg: string }> = {
  pending:    { label: 'EN ATTENTE', color: Colors.amber,   bg: Colors.amberBg    },
  processing: { label: 'EN COURS',   color: Colors.primary, bg: Colors.primaryBg  },
  done:       { label: 'SUCCÈS',     color: Colors.success, bg: Colors.successBg  },
  error:      { label: 'ERREUR',     color: Colors.error,   bg: Colors.errorBg    },
};

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  return format(new Date(ts), 'HH:mm:ss', { locale: fr });
}

function formatNotificationText(item: BridgeNotification): string {
  const path = typeof item.data?.path === 'string' ? item.data.path : '';
  if (path) return `${item.body}\n${path}`;
  return item.body;
}

function NotificationItem({ item }: { item: BridgeNotification }) {
  return (
    <View style={[styles.card, styles.notificationCard, Shadow.card]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, styles.notificationBadge]}>
          <Text style={[styles.badgeText, styles.notificationBadgeText]}>NOTIF PC</Text>
        </View>
        <Text style={styles.metaText}>{formatTime((item.timestamp || 0) * 1000)}</Text>
      </View>

      <Text style={styles.notificationTitle}>{item.title}</Text>
      <Text style={styles.resultText}>{formatNotificationText(item)}</Text>
    </View>
  );
}

// ── Composant item ────────────────────────────────────────────────────────────

function HistoryItem({ item }: { item: HistoryEntry }) {
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG['pending'];

  return (
    <View style={[styles.card, Shadow.card]}>
      {/* Ligne supérieure : statut + durée + heure */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={styles.cardMeta}>
          {item.duration_ms && (
            <Text style={styles.metaText}>{formatDuration(item.duration_ms)}</Text>
          )}
          <Text style={styles.metaText}>{formatTime(item.timestamp)}</Text>
        </View>
      </View>

      {/* Commande envoyée */}
      <View style={styles.commandRow}>
        <Text style={styles.prompt}>›</Text>
        <Text style={styles.commandText}>{item.command}</Text>
      </View>

      {/* Résultat */}
      {item.result && (
        <Text style={[styles.resultText, item.status === 'error' && styles.resultError]}>
          {item.result}
        </Text>
      )}
    </View>
  );
}

// ── Écran principal ───────────────────────────────────────────────────────────

export function HistoryScreen() {
  const { entries, clear } = useHistoryStore();
  const markAllNotificationsRead = useNotificationsStore((s) => s.markAllRead);
  const notifications = useNotificationsStore((s) => s.items);

  useFocusEffect(
    React.useCallback(() => {
      markAllNotificationsRead();
    }, [markAllNotificationsRead])
  );

  const confirmClear = () => {
    Alert.alert(
      'Vider l\'historique',
      'Supprimer toutes les commandes ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Vider', style: 'destructive', onPress: clear },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>HISTORIQUE</Text>
        {entries.length > 0 && (
          <TouchableOpacity onPress={confirmClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Vider</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Compteur ── */}
      {entries.length > 0 && (
        <Text style={styles.counter}>{entries.length} commande(s)</Text>
      )}

      {notifications.length > 0 && (
        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS PC</Text>
          <View style={styles.notificationsList}>
            {notifications.slice(0, 8).map((item) => (
              <NotificationItem key={item.id} item={item} />
            ))}
          </View>
        </View>
      )}

      {/* ── Liste ── */}
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>Aucune commande envoyée.</Text>
          <Text style={styles.emptyHint}>
            Les commandes envoyées depuis l'écran principal apparaîtront ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <HistoryItem item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.lg,
    paddingBottom:     Spacing.sm,
  },
  title: {
    fontSize: 22, fontWeight: '800',
    color: Colors.textPrimary, letterSpacing: 4,
  },
  clearBtn: {
    backgroundColor: Colors.errorBg,
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
  },
  clearText: { color: Colors.error, fontSize: 13, fontWeight: '600' },

  counter: {
    paddingHorizontal: Spacing.lg,
    paddingBottom:     Spacing.sm,
    fontSize: 12, color: Colors.textMuted, letterSpacing: 1,
  },
  notificationsSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 2,
    fontWeight: '700',
  },
  notificationsList: { gap: Spacing.md },

  list: { padding: Spacing.lg, gap: Spacing.md, paddingTop: Spacing.sm },

  // Card
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  notificationCard: {
    borderColor: Colors.primary,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  notificationBadge: { backgroundColor: Colors.primaryBg },
  notificationBadgeText: { color: Colors.primary },
  cardMeta:  { flexDirection: 'row', gap: Spacing.sm },
  metaText:  { fontSize: 11, color: Colors.textMuted },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  commandRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  prompt: { color: Colors.primary, fontSize: 18, fontWeight: '300', lineHeight: 22 },
  commandText: {
    flex: 1, fontSize: 15, fontWeight: '600',
    color: Colors.textPrimary, lineHeight: 22,
  },

  resultText: {
    fontSize: 13, color: Colors.textSecondary, lineHeight: 20,
    paddingLeft: Spacing.md + 4,
  },
  resultError: { color: Colors.error },

  // Empty
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.md, padding: Spacing.xl,
  },
  emptyIcon: { fontSize: 48, opacity: 0.3 },
  emptyText: {
    fontSize: 16, color: Colors.textSecondary, fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20,
  },
});
