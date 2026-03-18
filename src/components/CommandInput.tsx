/**
 * CommandInput.component.tsx — Champ texte + bouton Envoyer
 * Design : terminal dark avec bordure cyan animée au focus
 */

import React, { useRef, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, Text,
  StyleSheet, Animated, ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Radius } from '../theme';

interface Props {
  onSend:   (command: string) => void;
  loading:  boolean;
  disabled?: boolean;
}

export function CommandInput({ onSend, loading, disabled }: Props) {
  const [text, setText] = useState('');
  const borderAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () =>
    Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();

  const handleBlur = () =>
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();

  const borderColor = borderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [Colors.border, Colors.primary],
  });

  const submit = () => {
    if (!text.trim() || loading || disabled) return;
    onSend(text.trim());
    setText('');
  };

  // Commandes rapides fréquentes
  const QUICK_CMDS = [
    'Volume 50%',
    'Éteins dans 30s',
    'Ouvre Chrome',
    'Cherche rapport',
  ];

  return (
    <View style={styles.wrapper}>
      {/* Quick commands */}
      <View style={styles.quickRow}>
        {QUICK_CMDS.map(cmd => (
          <TouchableOpacity
            key={cmd}
            style={styles.quickBtn}
            onPress={() => onSend(cmd)}
            disabled={loading || disabled}
            activeOpacity={0.6}
          >
            <Text style={styles.quickText}>{cmd}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main input row */}
      <View style={styles.row}>
        <Animated.View style={[styles.inputWrap, { borderColor }]}>
          <Text style={styles.prompt}>›</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSubmitEditing={submit}
            placeholder="Tapez une commande..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="send"
            editable={!loading && !disabled}
            multiline={false}
            autoCorrect={false}
          />
        </Animated.View>

        <TouchableOpacity
          style={[
            styles.sendBtn,
            (loading || !text.trim() || disabled) && styles.sendBtnDisabled,
          ]}
          onPress={submit}
          disabled={loading || !text.trim() || disabled}
          activeOpacity={0.75}
        >
          {loading
            ? <ActivityIndicator size="small" color={Colors.bg} />
            : <Text style={styles.sendIcon}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.sm },

  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs,
  },
  quickBtn: {
    backgroundColor: Colors.primaryBg,
    borderRadius:    Radius.full,
    borderWidth:     1,
    borderColor:     Colors.borderAccent,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical:   4,
  },
  quickText: {
    color: Colors.textAccent, fontSize: 12, fontWeight: '500',
  },

  row: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
  },
  inputWrap: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.bgInput,
    borderRadius:    Radius.md,
    borderWidth:     1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm + 2,
    gap: Spacing.sm,
  },
  prompt: {
    color: Colors.primary, fontSize: 20, fontWeight: '300', lineHeight: 24,
  },
  input: {
    flex: 1, color: Colors.textPrimary, fontSize: 15,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  sendIcon: {
    color: Colors.bg, fontSize: 22, fontWeight: '700',
  },
});

// Exposer aussi la constante pour les tests
CommandInput.QUICK_CMDS = [
  'Volume 50%', 'Éteins dans 30s', 'Ouvre Chrome', 'Cherche rapport',
];