/**
 * Login Screen
 *
 * Fixes:
 * - Kein <form>-Tag (React Native), onSubmitEditing stattdessen
 * - Animated.Value korrekt initialisiert
 * - KeyboardAvoidingView offset auf Android entfernt (verursacht Layout-Bugs)
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Animated,
  ActivityIndicator, StatusBar, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { Colors, Spacing, Radius } from '../utils/theme';

const { width } = Dimensions.get('window');
const GRID_COLS = 18;

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pwRef = useRef<TextInput>(null);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError('Bitte alle Felder ausfüllen.');
      shake();
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (mode === 'login') {
        const r = await login(username.trim(), password);
        if (!r.ok) {
          setError(r.msg ?? 'Login fehlgeschlagen.');
          shake();
        }
      } else {
        const r = await register(username.trim(), password);
        if (r.ok) {
          setSuccess('Konto erstellt! Jetzt einloggen.');
          setMode('login');
          setPassword('');
        } else {
          setError(r.msg ?? 'Registrierung fehlgeschlagen.');
          shake();
        }
      }
    } catch {
      setError('Keine Verbindung zum Server.');
      shake();
    }
    setLoading(false);
  };

  const switchMode = (next: 'login' | 'register') => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setSuccess('');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* Hintergrund-Grid */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: GRID_COLS }).map((_, i) => (
          <View
            key={i}
            style={[styles.gridLine, { left: (i / (GRID_COLS - 1)) * width }]}
          />
        ))}
      </View>

      {/* Eck-Akzente */}
      <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logo}>
            <LinearGradient
              colors={[Colors.gold, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBox}
            >
              <Text style={styles.logoIcon}>◈</Text>
            </LinearGradient>
            <Text style={styles.appName}>CHAT</Text>
            <Text style={styles.tagline}>VERSCHLÜSSELT · PRIVAT · DIREKT</Text>
          </View>

          {/* Karte */}
          <Animated.View
            style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}
          >
            {/* Mode-Toggle */}
            <View style={styles.toggle}>
              {(['login', 'register'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
                  onPress={() => switchMode(m)}
                >
                  <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                    {m === 'login' ? 'EINLOGGEN' : 'REGISTRIEREN'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Felder */}
            <View style={styles.field}>
              <Text style={styles.label}>BENUTZERNAME</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="dein_name"
                placeholderTextColor={Colors.text3}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORT</Text>
              <TextInput
                ref={pwRef}
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.text3}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {/* Status */}
            {!!error && (
              <View style={[styles.status, styles.statusError]}>
                <Text style={styles.statusErrorText}>⚠ {error}</Text>
              </View>
            )}
            {!!success && (
              <View style={[styles.status, styles.statusSuccess]}>
                <Text style={styles.statusSuccessText}>✓ {success}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.submitWrap}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submit}
              >
                {loading
                  ? <ActivityIndicator color={Colors.bg} size="small" />
                  : <Text style={styles.submitText}>
                      {mode === 'login' ? 'ANMELDEN  →' : 'ERSTELLEN  →'}
                    </Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <Text style={styles.footer}>v1.0.0  ·  lokal gespeichert  ·  E2E-ready</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  gridLine: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.018)',
  },
  corner: {
    position: 'absolute',
    width: 52, height: 52,
  },
  cornerTL: {
    top: 52, left: 20,
    borderTopWidth: 2, borderLeftWidth: 2,
    borderColor: Colors.gold,
    opacity: 0.35,
  },
  cornerBR: {
    bottom: 36, right: 20,
    borderBottomWidth: 2, borderRightWidth: 2,
    borderColor: Colors.accent,
    opacity: 0.35,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 32,
  },
  logo: { alignItems: 'center', marginBottom: 44 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  logoIcon: { fontSize: 36, color: Colors.bg },
  appName: {
    fontSize: 30, fontWeight: '900',
    color: Colors.text, letterSpacing: 14,
  },
  tagline: {
    fontSize: 9, color: Colors.text3,
    letterSpacing: 2.5, marginTop: 7,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.sm,
    padding: 3,
    marginBottom: Spacing.xl,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.sm - 1,
  },
  toggleBtnActive: { backgroundColor: Colors.gold },
  toggleText: { fontSize: 10, fontWeight: '700', color: Colors.text3, letterSpacing: 1 },
  toggleTextActive: { color: Colors.bg },
  field: { marginBottom: Spacing.lg },
  label: {
    fontSize: 10, fontWeight: '700',
    color: Colors.text3, letterSpacing: 2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  status: {
    borderRadius: Radius.sm, padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statusError: {
    backgroundColor: 'rgba(255,68,102,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,68,102,0.3)',
  },
  statusSuccess: {
    backgroundColor: 'rgba(0,229,160,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)',
  },
  statusErrorText: { color: Colors.error, fontSize: 13, fontWeight: '600' },
  statusSuccessText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
  submitWrap: {
    borderRadius: Radius.sm, overflow: 'hidden',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 8,
  },
  submit: { paddingVertical: 15, alignItems: 'center' },
  submitText: { fontSize: 13, fontWeight: '900', color: Colors.bg, letterSpacing: 2 },
  footer: {
    textAlign: 'center', color: Colors.text3,
    fontSize: 10, marginTop: 28, letterSpacing: 1,
  },
});
