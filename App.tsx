/**
 * App.tsx — Point d'entrée Jarvis Mobile
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer }    from '@react-navigation/native';
import { SafeAreaProvider }       from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar }              from 'expo-status-bar';
import { AppNavigator }           from './src/navigation/AppNavigator';
import { checkHealth }            from './src/services/api.service';
import { Colors }                 from './src/theme';
import { useNotifications }       from './src/hooks/useNotifications';
import { BridgeNotification }     from './src/services/api.service';

export default function App() {
  const [ready,  setReady]  = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerText, setBannerText] = useState('');
  const [bannerType, setBannerType] = useState<string>('info');

  const { lastNotification } = useNotifications(true);

  useEffect(() => {
    checkHealth().then(r => { setOnline(r.online); setReady(true); });
  }, []);

  useEffect(() => {
    if (!lastNotification) return;
    setBannerText(formatNotification(lastNotification));
    setBannerType(lastNotification.type || 'info');
    setBannerVisible(true);

    const timer = setTimeout(() => setBannerVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [lastNotification]);

  if (!ready) return (
    <View style={s.splash}>
      <StatusBar style="light" />
      <Text style={s.splashJ}>J</Text>
      <Text style={s.splashTitle}>JARVIS</Text>
      <ActivityIndicator color={Colors.primary} style={{ marginTop: 28 }} />
      <Text style={s.splashSub}>Connexion au PC...</Text>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={{ dark:true, colors:{
          primary:Colors.primary, background:Colors.bg, card:Colors.bgCard,
          text:Colors.textPrimary, border:Colors.border, notification:Colors.primary,
        }}}>
          <StatusBar style="light" backgroundColor={Colors.bg} />
          {online === false && (
            <View style={s.offline}>
              <Text style={s.offlineText}>⚠  PC HORS LIGNE</Text>
            </View>
          )}

          {bannerVisible && (
            <View style={[s.banner, bannerStyleForType(bannerType)]}>
              <Text style={s.bannerText}>{bannerText}</Text>
            </View>
          )}

          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function formatNotification(notification: BridgeNotification): string {
  const icon =
    notification.type === 'battery_low' ? '🔋' :
    notification.type === 'error' ? '❌' :
    notification.type === 'task_done' ? '✅' :
    notification.type === 'screenshot' ? '📸' :
    'ℹ️';

  return `${icon} ${notification.title}: ${notification.body}`;
}

function bannerStyleForType(type: string) {
  if (type === 'error') {
    return { backgroundColor: Colors.errorBg, borderBottomColor: Colors.error };
  }
  if (type === 'battery_low') {
    return { backgroundColor: Colors.amberBg, borderBottomColor: Colors.amber };
  }
  if (type === 'task_done') {
    return { backgroundColor: Colors.successBg, borderBottomColor: Colors.success };
  }
  return { backgroundColor: Colors.primaryBg, borderBottomColor: Colors.primary };
}

const s = StyleSheet.create({
  splash: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:Colors.bg, gap:4 },
  splashJ: { fontSize:72, fontWeight:'800', color:Colors.primary, lineHeight:80,
    textShadowColor:Colors.primary, textShadowOffset:{width:0,height:0}, textShadowRadius:28 },
  splashTitle: { fontSize:18, fontWeight:'700', color:Colors.textSecondary, letterSpacing:12 },
  splashSub:   { marginTop:8, fontSize:11, color:Colors.textMuted, letterSpacing:3 },
  offline:     { backgroundColor:Colors.errorBg, borderBottomWidth:1, borderBottomColor:Colors.error,
    paddingVertical:6, alignItems:'center' },
  offlineText: { fontSize:11, color:Colors.error, letterSpacing:1 },
  banner: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
