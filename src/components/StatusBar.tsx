/**
 * StatusBar.component.tsx — Indicateur de statut PC en haut d'écran
 * Affiche : ONLINE / OFFLINE / CHECKING avec animations de pulsation
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
} from 'react-native';
import { Colors, Spacing, Radius } from '../theme';
import { checkHealth } from '../services/api.service';

type PcStatus = 'checking' | 'online' | 'offline';

export function PcStatusBar() {
  const [pcStatus, setPcStatus] = useState<PcStatus>('checking');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const ping = async () => {
    setPcStatus('checking');
    const result = await checkHealth();
    if (result.ok && result.online) {
      setPcStatus('online');
    } else {
      setPcStatus('offline');
    }
  };

  useEffect(() => {
    ping();
    const interval = setInterval(ping, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Pulsation LED
  useEffect(() => {
    if (pcStatus === 'online') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pcStatus]);

  const dotColor = pcStatus === 'online'
    ? Colors.success
    : pcStatus === 'offline'
    ? Colors.error
    : Colors.amber;

  const label = pcStatus === 'online'
    ? 'PC EN LIGNE'
    : pcStatus === 'offline'
    ? 'PC HORS LIGNE'
    : 'CONNEXION...';

  return (
    <TouchableOpacity style={styles.container} onPress={ping} activeOpacity={0.7}>
      <Animated.View
        style={[styles.dot, { backgroundColor: dotColor, opacity: pulseAnim }]}
      />
      <Text style={[styles.label, { color: dotColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'center',
    alignSelf:      'center',
    backgroundColor: Colors.bgCard,
    borderRadius:   Radius.full,
    borderWidth:    1,
    borderColor:    Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
    gap: Spacing.sm,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
  },
  label: {
    fontSize:    11,
    fontWeight:  '600',
    letterSpacing: 1.5,
  },
});
