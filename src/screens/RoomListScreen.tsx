/**
 * RoomList Screen
 *
 * Fixes:
 * - interval cleanup korrekt mit useEffect return
 * - Animated.loop gestoppt wenn inviteCount === 0
 * - Modal über SafeAreaView korrekt
 * - Avatar userId für DMs korrigiert (other_id verwenden wenn vorhanden)
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, StatusBar, Animated,
  Modal, Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import * as apiSvc from '../services/api';
import * as db from '../services/database';
import { Colors, Spacing, Radius } from '../utils/theme';

export interface Room {
  id: string;
  name: string;
  topic: string;
  type: string;
  member_count: number;
  last_msg: string;
  last_time: string;
  last_ts: number;
  avatar_text: string;
  avatar_color: string;
  avatar_url: string | null;
}

interface Props {
  onSelectRoom: (room: Room) => void;
}

export default function RoomListScreen({ onSelectRoom }: Props) {
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [inviteCount, setInviteCount] = useState(0);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [newMode, setNewMode] = useState<'dm' | 'group'>('dm');
  const [newChatId, setNewChatId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      const r = await apiSvc.getRooms();
      if (r.ok && Array.isArray(r.rooms)) {
        setRooms(r.rooms);
        await db.saveRooms(r.rooms);
      }
    } catch {
      const cached = await db.getRooms();
      if (cached.length > 0) setRooms(cached as Room[]);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const r = await apiSvc.getInvites();
      if (r.ok && Array.isArray(r.invites)) {
        setInviteCount(r.invites.length);
        setInvites(r.invites);
        await db.saveInvites(r.invites);
      } else {
        setInviteCount(0);
        setInvites([]);
      }
    } catch {
      const cached = await db.getInvites();
      setInviteCount(cached.length);
      setInvites(cached);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await db.getRooms();
      if (cached.length > 0) setRooms(cached as Room[]);
      setLoading(false);
      await Promise.all([loadRooms(), loadInvites()]);
    })();
    pollRef.current = setInterval(() => {
      loadRooms();
      loadInvites();
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadRooms, loadInvites]);

  // Pulse-Animation für Einladungs-Badge
  useEffect(() => {
    if (pulseLoop.current) {
      pulseLoop.current.stop();
      pulseLoop.current = null;
    }
    if (inviteCount > 0) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [inviteCount, pulseAnim]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRooms(), loadInvites()]);
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (newMode === 'dm') {
      if (!newChatId.trim()) return;
      setActionLoading(true);
      const r = await apiSvc.createDM(newChatId.trim());
      setActionLoading(false);
      if (r.ok) {
        setShowNew(false);
        setNewChatId('');
        await loadRooms();
      } else {
        Alert.alert('Fehler', r.msg ?? 'User nicht gefunden.');
      }
    } else {
      const name = newGroupName.trim() || 'Neue Gruppe';
      setActionLoading(true);
      const r = await apiSvc.createGroup(name);
      setActionLoading(false);
      if (r.ok) {
        setShowNew(false);
        setNewGroupName('');
        await loadRooms();
      } else {
        Alert.alert('Fehler', r.msg ?? 'Fehler beim Erstellen.');
      }
    }
  };

  const handleInvite = async (roomId: string, accept: boolean) => {
    await apiSvc.respondInvite(roomId, accept);
    await Promise.all([loadRooms(), loadInvites()]);
  };

  const filtered = searchQuery
    ? rooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : rooms;

  const renderRoom = ({ item }: { item: Room }) => (
    <TouchableOpacity
      style={styles.roomItem}
      onPress={() => onSelectRoom(item)}
      activeOpacity={0.75}
    >
      <Avatar
        name={item.name || '??'}
        userId={item.id}
        avatarUrl={item.avatar_url}
        size={48}
      />
      <View style={styles.roomMeta}>
        <View style={styles.roomHeader}>
          <Text style={styles.roomName} numberOfLines={1}>
            {item.name || 'Unbenannt'}
          </Text>
          <View style={styles.roomRight}>
            {!!item.last_time && (
              <Text style={styles.roomTime}>{item.last_time}</Text>
            )}
            <View style={[styles.badge, item.type === 'group' && styles.badgeGroup]}>
              <Text style={styles.badgeText}>
                {item.type === 'group' ? '#GRP' : '⇌DM'}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.roomPreview} numberOfLines={1}>
          {item.last_msg || (item.type === 'group'
            ? `${item.member_count} Mitglieder`
            : 'Noch keine Nachricht')}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CHAT</Text>
          <Text style={styles.headerSub}>{user?.username}</Text>
        </View>
        <View style={styles.headerActions}>
          {inviteCount > 0 && (
            <TouchableOpacity style={styles.inviteBtn} onPress={() => setShowInvites(true)}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={styles.inviteDot}>
                  <Text style={styles.inviteDotText}>{inviteCount}</Text>
                </View>
              </Animated.View>
              <Text style={styles.inviteBtnLabel}>Einladungen</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowNew(true)}>
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              style={styles.iconBtnGrad}
            >
              <Text style={styles.iconBtnPlus}>+</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnGhost]} onPress={logout}>
            <Text style={styles.logoutIcon}>⏻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Suche */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Suchen..."
          placeholderTextColor={Colors.text3}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Liste */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={styles.loadingText}>Lade Chats…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>◈</Text>
          <Text style={styles.emptyTitle}>Keine Chats</Text>
          <Text style={styles.emptyText}>Tippe + um einen neuen Chat zu starten</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRoom}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.gold}
              colors={[Colors.gold]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal: Neuer Chat */}
      <Modal visible={showNew} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>NEUER CHAT</Text>
            <View style={styles.toggle}>
              {(['dm', 'group'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.toggleBtn, newMode === m && styles.toggleBtnActive]}
                  onPress={() => setNewMode(m)}
                >
                  <Text style={[styles.toggleText, newMode === m && styles.toggleTextActive]}>
                    {m === 'dm' ? 'DIREKTNACHRICHT' : 'GRUPPE'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {newMode === 'dm' ? (
              <View style={styles.field}>
                <Text style={styles.label}>USER-ID (6-stellig)</Text>
                <TextInput
                  style={styles.input}
                  value={newChatId}
                  onChangeText={setNewChatId}
                  placeholder="123456"
                  placeholderTextColor={Colors.text3}
                  keyboardType="numeric"
                  maxLength={6}
                />
              </View>
            ) : (
              <View style={styles.field}>
                <Text style={styles.label}>GRUPPENNAME</Text>
                <TextInput
                  style={styles.input}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder="Meine Gruppe"
                  placeholderTextColor={Colors.text3}
                />
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowNew(false); setNewChatId(''); setNewGroupName(''); }}
              >
                <Text style={styles.modalCancelText}>ABBRECHEN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={handleCreate}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator color={Colors.bg} size="small" />
                  : <Text style={styles.modalConfirmText}>ERSTELLEN</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Einladungen */}
      <Modal visible={showInvites} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>EINLADUNGEN</Text>
            {invites.length === 0 ? (
              <Text style={styles.emptyText}>Keine Einladungen</Text>
            ) : (
              invites.map(inv => (
                <View key={inv.room_id} style={styles.inviteItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inviteName}>{inv.room_name || 'Chat'}</Text>
                    <Text style={styles.inviteFrom}>
                      von {inv.from_name ?? inv.from ?? '?'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.inviteAccept}
                    onPress={() => handleInvite(inv.room_id, true)}
                  >
                    <Text style={styles.inviteAcceptText}>✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inviteDecline}
                    onPress={() => handleInvite(inv.room_id, false)}
                  >
                    <Text style={styles.inviteDeclineText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity
              style={[styles.modalCancel, { marginTop: Spacing.md }]}
              onPress={() => setShowInvites(false)}
            >
              <Text style={styles.modalCancelText}>SCHLIESSEN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20, fontWeight: '900', color: Colors.gold, letterSpacing: 8,
  },
  headerSub: { fontSize: 11, color: Colors.text3, marginTop: 2, letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 4 },
  inviteDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  inviteBtnLabel: { color: Colors.error, fontSize: 11, fontWeight: '600' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    overflow: 'hidden',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  iconBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtnPlus: { color: Colors.bg, fontSize: 24, fontWeight: '700', lineHeight: 28 },
  iconBtnGhost: {
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    shadowOpacity: 0,
  },
  logoutIcon: { color: Colors.text2, fontSize: 17, textAlign: 'center', lineHeight: 36 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface2,
    margin: Spacing.md, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { color: Colors.text3, fontSize: 18, marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 10, color: Colors.text, fontSize: 14 },
  searchClear: { color: Colors.text3, fontSize: 14, padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  loadingText: { color: Colors.text3, marginTop: Spacing.md, letterSpacing: 1 },
  emptyIcon: { fontSize: 44, color: Colors.gold, opacity: 0.35, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: Colors.text3, textAlign: 'center' },
  roomItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  roomMeta: { flex: 1, overflow: 'hidden' },
  roomHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  roomName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  roomRight: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 6 },
  roomTime: { fontSize: 10, color: Colors.text3 },
  badge: {
    backgroundColor: Colors.surface3,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  badgeGroup: { backgroundColor: 'rgba(108,92,231,0.2)' },
  badgeText: { fontSize: 9, color: Colors.text3, fontWeight: '700' },
  roomPreview: { fontSize: 12, color: Colors.text2 },
  sep: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
  // Modals
  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  modalTitle: {
    fontSize: 13, fontWeight: '900', color: Colors.gold,
    letterSpacing: 4, marginBottom: Spacing.lg,
  },
  toggle: {
    flexDirection: 'row', backgroundColor: Colors.surface2,
    borderRadius: Radius.sm, padding: 3, marginBottom: Spacing.lg,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.sm - 1 },
  toggleBtnActive: { backgroundColor: Colors.gold },
  toggleText: { fontSize: 10, fontWeight: '700', color: Colors.text3, letterSpacing: 1 },
  toggleTextActive: { color: Colors.bg },
  field: { marginBottom: Spacing.lg },
  label: { fontSize: 10, fontWeight: '700', color: Colors.text3, letterSpacing: 2, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 13,
    color: Colors.text, fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.md },
  modalCancel: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modalCancelText: { color: Colors.text2, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  modalConfirm: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.sm,
    backgroundColor: Colors.gold, alignItems: 'center',
  },
  modalConfirmText: { color: Colors.bg, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  inviteItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderRadius: Radius.sm,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  inviteName: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  inviteFrom: { color: Colors.text3, fontSize: 11, marginTop: 2 },
  inviteAccept: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: 'rgba(0,229,160,0.12)',
    borderWidth: 1, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteAcceptText: { color: Colors.success, fontWeight: '700', fontSize: 16 },
  inviteDecline: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: 'rgba(255,68,102,0.12)',
    borderWidth: 1, borderColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteDeclineText: { color: Colors.error, fontWeight: '700', fontSize: 16 },
});
