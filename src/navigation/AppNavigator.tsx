/**
 * AppNavigator.tsx — Navigation principale (5 onglets)
 * Semaine 4 — Ajout de l'onglet MUSIQUE
 */
import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen }    from '../screens/HomeScreen';
import { SMSModeScreen } from '../screens/SMSModeScreen';
import { VoiceScreen }   from '../screens/VoiceScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MusicScreen }   from '../screens/MusicScreen';
import { Colors, Spacing } from '../theme';
import { useNotificationsStore } from '../store/notifications.store';

const Tab = createBottomTabNavigator();

function Icon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{
      fontSize:   20,
      color:      focused ? Colors.primary : Colors.textMuted,
      lineHeight: 24,
    }}>
      {glyph}
    </Text>
  );
}

export function AppNavigator() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bgCard,
          borderTopColor:  Colors.border,
          borderTopWidth:  1,
          height:          64,
          paddingBottom:   Spacing.sm,
        },
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize:      9,
          letterSpacing: 2,
          fontWeight:    '600',
          marginTop:     -2,
        },
      }}
    >
      <Tab.Screen
        name="Commande"
        component={HomeScreen}
        options={{
          tabBarLabel: 'COMMANDE',
          tabBarIcon: ({ focused }) => <Icon glyph="⌘" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={SMSModeScreen}
        options={{
          tabBarLabel: 'CHAT',
          tabBarIcon: ({ focused }) => <Icon glyph="◻" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Vocal"
        component={VoiceScreen}
        options={{
          tabBarLabel: 'VOCAL',
          tabBarIcon: ({ focused }) => <Icon glyph="◉" focused={focused} />,
        }}
      />
      {/* Semaine 4 — Onglet Musique */}
      <Tab.Screen
        name="Musique"
        component={MusicScreen}
        options={{
          tabBarLabel: 'MUSIQUE',
          tabBarIcon: ({ focused }) => <Icon glyph="♫" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Historique"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'HISTORIQUE',
          tabBarIcon: ({ focused }) => <Icon glyph="☰" focused={focused} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
    </Tab.Navigator>
  );
}