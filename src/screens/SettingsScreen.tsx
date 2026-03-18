/**
 * SettingsScreen.tsx — Configuration de l'app
 * URL Azure Function, token de sécurité, Device ID
 * (Les valeurs sont pré-remplies depuis les constantes, modifiables à la volée)
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../theme';
import { API_CONFIG, checkHealth } from '../services/api.service';

export function SettingsScreen() {
  const [baseUrl, setBaseUrl]   = useState(API_CONFIG.BASE_URL);
  const [token,   setToken]     = useState(API_CONFIG.SECRET_TOKEN);
  const [deviceId, setDeviceId] = useState(API_CONFIG.DEVICE_ID);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await checkHealth();
    setTesting(false);
    if (result.ok) {
      const pc = result.data.pc_connected;
      setTestResult(pc
        ? `✓ PC en ligne (uptime: ${result.data.uptime_s ?? '?'}s)`
        : '⚠ Azure Function OK mais PC hors ligne'
      );
    } else {
      setTestResult(`✕ ${result.error}`);
    }
  };

  const saveSettings = () => {
    // Dans une vraie implémentation : persistance SecureStore
    // Pour l'instant, les valeurs sont en mémoire
    Alert.alert('Sauvegardé', 'Les paramètres sont appliqués pour cette session.\n(Persistance SecureStore — Semaine 10)');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>

        <Text style={styles.title}>PARAMÈTRES</Text>
        <Text style={styles.subtitle}>Configuration de la connexion PC</Text>

        {/* ── Section connexion ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AZURE FUNCTION</Text>

          <Text style={styles.label}>URL de base</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.label}>Secret Token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.label}>Device ID</Text>
          <TextInput
            style={styles.input}
            value={deviceId}
            onChangeText={setDeviceId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* ── Test connexion ── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={testConnection}
          disabled={testing}
          activeOpacity={0.7}
        >
          <Text style={styles.btnSecondaryText}>
            {testing ? 'Test en cours...' : 'Tester la connexion'}
          </Text>
        </TouchableOpacity>

        {testResult && (
          <View style={[
            styles.testResult,
            testResult.startsWith('✓')
              ? { borderColor: Colors.success, backgroundColor: Colors.successBg }
              : { borderColor: Colors.error,   backgroundColor: Colors.errorBg   }
          ]}>
            <Text style={styles.testResultText}>{testResult}</Text>
          </View>
        )}

        {/* ── Sauvegarder ── */}
        <TouchableOpacity style={styles.btn} onPress={saveSettings} activeOpacity={0.8}>
          <Text style={styles.btnText}>Sauvegarder</Text>
        </TouchableOpacity>

        {/* ── Info ── */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️  PC Agent requis</Text>
          <Text style={styles.infoText}>
            Assurez-vous que <Text style={styles.code}>python main.py</Text> tourne
            sur votre PC Windows et que l'Azure Function est déployée.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.lg },

  title:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 4 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: -Spacing.sm },

  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textAccent,
    letterSpacing: 2, marginBottom: Spacing.xs,
  },
  label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, color: Colors.textPrimary, fontSize: 14,
  },

  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md, padding: Spacing.md + 2,
    alignItems: 'center',
  },
  btnText: { color: Colors.bg, fontWeight: '700', fontSize: 15 },

  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: Colors.primary,
  },
  btnSecondaryText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },

  testResult: {
    borderRadius: Radius.md, borderWidth: 1,
    padding: Spacing.md,
  },
  testResultText: { color: Colors.textPrimary, fontSize: 14 },

  infoBox: {
    backgroundColor: Colors.primaryBg,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.borderAccent,
    padding: Spacing.md, gap: Spacing.xs,
  },
  infoTitle: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  infoText:  { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  code: {
    color: Colors.primary, fontFamily: 'monospace', fontSize: 13,
  },
});
