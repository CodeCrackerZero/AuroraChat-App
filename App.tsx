/**
 * App.tsx — Navigation Root
 *
 * Verwendet einen einfachen State-basierten Navigator (kein expo-router),
 * damit der Build ohne zusätzliche Konfiguration funktioniert.
 */
import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/hooks/useAuth';
import LoginScreen from './src/screens/LoginScreen';
import RoomListScreen, { Room } from './src/screens/RoomListScreen';
import ChatScreen from './src/screens/ChatScreen';
import { Colors } from './src/utils/theme';

type Screen = 'rooms' | 'chat';

function AppNavigator() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>('rooms');
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (screen === 'chat' && activeRoom) {
    return (
      <ChatScreen
        room={activeRoom}
        onBack={() => {
          setScreen('rooms');
          setActiveRoom(null);
        }}
      />
    );
  }

  return (
    <RoomListScreen
      onSelectRoom={(room: Room) => {
        setActiveRoom(room);
        setScreen('chat');
      }}
    />
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" backgroundColor={Colors.bg} />
          <AppNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
