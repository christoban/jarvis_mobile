/**
 * SMSModeScreen.tsx — Interface conversation style messagerie
 * SEMAINE 7 — Mardi
 *
 * Chaque commande envoyée + réponse PC apparaît comme des bulles.
 * Jarvis répond avec le résultat réel de l'exécution.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Keyboard,
  KeyboardAvoidingView, Platform, Vibration, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../theme';
import { sendAndWait, sendConfirmation, waitForCommandResult } from '../services/api.service';
import { useHistoryStore } from '../store/history.store';
import { speak } from '../utils/tts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Bubble {
  id:        string;
  role:      'user' | 'jarvis';
  text:      string;
  pending?:  boolean;
  success?:  boolean;
  ts:        number;
}

const WELCOME: Bubble = {
  id:   'welcome',
  role: 'jarvis',
  text: 'Bonjour. Je suis Jarvis.\nTapez une commande pour contrôler votre PC.',
  ts:   Date.now(),
};

let _seq = 0;
const uid = () => `b_${Date.now()}_${++_seq}`;

// ── Composant principal ───────────────────────────────────────────────────────
export function SMSModeScreen() {
  const [bubbles,  setBubbles]  = useState<Bubble[]>([WELCOME]);
  const [text,     setText]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const listRef = useRef<FlatList>(null);

  const { addPending, updateEntry } = useHistoryStore();

  const askDangerousConfirmation = (message: string): Promise<'confirm' | 'refuse'> =>
    new Promise((resolve) => {
      Alert.alert(
        'Confirmation requise',
        message,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => resolve('refuse') },
          { text: 'Confirmer', style: 'destructive', onPress: () => resolve('confirm') },
        ],
        { cancelable: false }
      );
    });

  // Scroll automatique vers le bas
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [bubbles]);

  const handleSend = useCallback(async () => {
    const cmd = text.trim();
    if (!cmd || loading) return;

    Keyboard.dismiss();
    Vibration.vibrate(20);
    setText('');
    setLoading(true);

    const histId    = uid();
    const pendingId = uid();

    // Bulle utilisateur
    setBubbles(prev => [...prev, { id: uid(), role: 'user', text: cmd, ts: Date.now() }]);

    // Bulle Jarvis "en attente"
    setBubbles(prev => [...prev, { id: pendingId, role: 'jarvis', text: '', pending: true, ts: Date.now() }]);

    addPending(histId, cmd);

    let result = await sendAndWait(cmd);

    if (result.awaitingConfirm && result.data?.confirm_id) {
      const action = await askDangerousConfirmation(result.data?.message || 'Confirmation requise');
      const confirmed = await sendConfirmation(String(result.data.confirm_id), action);
      if (!confirmed.ok) {
        result = {
          ok: false,
          status: 'error',
          error: confirmed.error || 'Echec confirmation',
          data: null,
        } as any;
      } else if (action === 'refuse') {
        result = {
          ok: false,
          status: 'error',
          error: 'Action annulée',
          data: null,
        } as any;
      } else {
        result = await waitForCommandResult(String(result.data.command_id));
      }
    }

    const success = result.status === 'success' || result.ok === true;
    const payload = result.data?.result ?? result.data ?? {};
    const msg =
      (typeof payload === 'string' ? payload : null) ||
      payload?.message ||
      payload?.display ||
      result.data?.message ||
      result.error ||
      (success ? 'Commande exécutée.' : 'Erreur inconnue.');
    updateEntry(histId, {
      status: success ? 'done' : 'error',
      result: msg,
      duration_ms: result.data?.duration_ms,
    });

    // Remplacer la bulle pending par la vraie réponse
    setBubbles(prev => prev.map(b =>
      b.id === pendingId
        ? { ...b, text: msg, pending: false, success }
        : b
    ));

    if (success) speak(msg);
    setLoading(false);
    
    Vibration.vibrate(success ? [0, 30, 40, 30] : [0, 60, 30, 60]);
  }, [text, loading, addPending, updateEntry]);

  function fmt(ts: number) {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Rendu d'une bulle ────────────────────────────────────────────────────────
  function renderBubble({ item }: { item: Bubble }) {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.row, isUser ? styles.rowUser : styles.rowJarvis]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>J</Text>
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser    ? styles.bubbleUser    : styles.bubbleJarvis,
          item.success === false && !item.pending ? styles.bubbleError : null,
        ]}>
          {item.pending ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {item.text}
            </Text>
          )}
          <Text style={styles.bubbleTime}>{fmt(item.ts)}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.dot} />
        <View>
          <Text style={styles.headerName}>JARVIS PC</Text>
          <Text style={styles.headerSub}>{loading ? 'En train de traiter...' : 'En ligne'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Liste des bulles */}
        <FlatList
          ref={listRef}
          data={bubbles}
          keyExtractor={b => b.id}
          renderItem={renderBubble}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Barre de saisie */}
        <View style={styles.bar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            placeholder="Envoyer une commande..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="send"
            editable={!loading}
            autoCorrect={false}
            autoCapitalize="sentences"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || loading) && styles.sendBtnOff]}
            onPress={handleSend}
            disabled={!text.trim() || loading}
            activeOpacity={0.75}
          >
            {loading
              ? <ActivityIndicator size="small" color={Colors.bg} />
              : <Text style={styles.sendIcon}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({} as any); // unused, just for reference
const styles = StyleSheet.create({
  safe: { flex:1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  dot: {
    width:8, height:8, borderRadius:4, backgroundColor: Colors.success,
    shadowColor: Colors.success, shadowOffset:{width:0,height:0},
    shadowOpacity:0.8, shadowRadius:5,
  },
  headerName: {
    color: Colors.textPrimary, fontSize:14, fontWeight:'700', letterSpacing:2,
  },
  headerSub: {
    color: Colors.success, fontSize:10, letterSpacing:1, marginTop:1,
  },

  list:        { flex:1 },
  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.lg },

  row: { flexDirection:'row', alignItems:'flex-end', gap: Spacing.sm },
  rowUser:   { justifyContent:'flex-end'  },
  rowJarvis: { justifyContent:'flex-start' },

  avatar: {
    width:32, height:32, borderRadius:16,
    backgroundColor: Colors.bgElevated,
    borderWidth:1, borderColor: Colors.primary,
    alignItems:'center', justifyContent:'center',
  },
  avatarLetter: { color: Colors.primary, fontSize:13, fontWeight:'700' },

  bubble: {
    maxWidth:'78%', borderRadius: Radius.lg, padding: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  bubbleUser: {
    backgroundColor: Colors.primary, borderBottomRightRadius: Radius.sm,
  },
  bubbleJarvis: {
    backgroundColor: Colors.bgCard, borderWidth:1, borderColor: Colors.border,
    borderBottomLeftRadius: Radius.sm,
  },
  bubbleError: {
    borderColor: Colors.error, backgroundColor: Colors.errorBg,
  },
  bubbleText: {
    color: Colors.textPrimary, fontSize:14, lineHeight:21,
  },
  bubbleTextUser: { color: Colors.bg, fontWeight:'600' },
  bubbleTime: {
    color:'rgba(128,128,160,0.55)', fontSize:9, marginTop:4, textAlign:'right',
  },

  bar: {
    flexDirection:'row', alignItems:'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderTopWidth:1, borderTopColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  input: {
    flex:1, backgroundColor: Colors.bgInput, borderRadius: Radius.xl,
    borderWidth:1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.textPrimary, fontSize:14, maxHeight:100,
  },
  sendBtn: {
    width:44, height:44, borderRadius:22,
    backgroundColor: Colors.primary, alignItems:'center', justifyContent:'center',
    shadowColor: Colors.primary, shadowOffset:{width:0,height:0},
    shadowOpacity:0.5, shadowRadius:8, elevation:4,
  },
  sendBtnOff: { backgroundColor: Colors.bgElevated, shadowOpacity:0, elevation:0 },
  sendIcon:   { color: Colors.bg, fontSize:20, fontWeight:'700', marginTop:-1 },
});
