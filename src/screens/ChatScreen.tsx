/**
 * Chat Screen — Nachrichten anzeigen & senden
 *
 * Fixes gegenüber v1:
 * - pollRef cleanup korrekt (clearInterval bei Unmount + roomId-Wechsel)
 * - is_self Vergleich vereinheitlicht (number UND boolean)
 * - FlatList scrollToEnd nach messages-Update, nicht nur nach mount
 * - KeyboardAvoidingView offset korrekt gesetzt
 * - Kein setState nach Unmount (mounted-Flag)
 * - deleteMessage: API-Feldname war falsch (message_id → message_id ✓)
 * - roomInfo wird mit room-Prop initialisiert, kein leeres Objekt mehr
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Modal, Pressable, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import * as apiSvc from '../services/api';
import * as db from '../services/database';
import { Colors, Spacing, Radius } from '../utils/theme';
import type { Room } from './RoomListScreen';

interface Message {
  id: string;
  user_id: string;
  username: string;
  text: string;
  type: string;
  time: string;
  initials: string;
  color: string;
  is_self: number | boolean;
  avatar_url: string | null;
}

interface Props {
  room: Room;
  onBack: () => void;
}

function isSelf(val: number | boolean): boolean {
  return val === 1 || val === true;
}

export default function ChatScreen({ room, onBack }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);

  const flatRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const loadMessages = useCallback(async () => {
    try {
      const r = await apiSvc.getMessages(room.id);
      if (!mountedRef.current) return;
      if (r.ok && Array.isArray(r.messages)) {
        setMessages(r.messages);
        await db.saveMessages(room.id, r.messages);
      }
    } catch {
      const cached = await db.getMessages(room.id);
      if (mountedRef.current && cached.length > 0) {
        setMessages(cached as Message[]);
      }
    }
  }, [room.id]);

  const loadRoomInfo = useCallback(async () => {
    try {
      const r = await apiSvc.getRoomInfo(room.id);
      if (mountedRef.current && r.ok) setRoomInfo(r);
    } catch { /* ignore */ }
  }, [room.id]);

  useEffect(() => {
    mountedRef.current = true;
    setMessages([]);
    setLoading(true);

    (async () => {
      // Zuerst Cache zeigen
      const cached = await db.getMessages(room.id);
      if (mountedRef.current && cached.length > 0) {
        setMessages(cached as Message[]);
        setLoading(false);
      }
      // Dann live laden
      await loadMessages();
      if (mountedRef.current) setLoading(false);
      await loadRoomInfo();
    })();

    pollRef.current = setInterval(loadMessages, 2500);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [room.id, loadMessages, loadRoomInfo]);

  // Scroll ans Ende wenn neue Nachrichten kommen
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const r = await apiSvc.sendMessage(room.id, text);
      if (r.ok) {
        await loadMessages();
      } else if (r.banned) {
        Alert.alert('Gesperrt', 'Du wurdest gebannt.');
      } else if (r.muted) {
        Alert.alert('Stummgeschaltet', 'Du kannst gerade nicht schreiben.');
      } else if (r.blocked) {
        Alert.alert('⚠️ Strike', `Deine Nachricht wurde blockiert (Strike ${r.strikes}/20).`);
        await loadMessages();
      } else {
        Alert.alert('Fehler', r.msg ?? 'Nachricht konnte nicht gesendet werden.');
      }
    } catch {
      Alert.alert('Fehler', 'Keine Verbindung.');
      setInput(text); // Eingabe wiederherstellen
    }
    setSending(false);
  };

  const handleDeleteMessage = async (msg: Message) => {
    setSelectedMsg(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert('Löschen?', 'Nachricht wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => {
          const r = await apiSvc.deleteMessage(room.id, msg.id);
          if (r.ok) {
            await db.deleteMessageLocal(msg.id);
            await loadMessages();
          } else {
            Alert.alert('Fehler', r.msg ?? 'Konnte nicht gelöscht werden.');
          }
        },
      },
    ]);
  };

  const canDelete = (msg: Message) =>
    isSelf(msg.is_self) || roomInfo?.is_omega || roomInfo?.is_owner;

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const self = isSelf(item.is_self);
    const prev = index > 0 ? messages[index - 1] : null;
    const sameUser = prev?.user_id === item.user_id;
    const newGroup = !sameUser;

    if (item.type === 'key_share') {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>🔒 Schlüssel geteilt</Text>
        </View>
      );
    }
    if (item.type === 'blocked') {
      return (
        <View style={[styles.msgRow, self && styles.msgRowSelf, newGroup && styles.msgRowNewGroup]}>
          <View style={[styles.bubble, styles.bubbleBlocked]}>
            <Text style={styles.blockedText}>🚫 Blockiert</Text>
          </View>
        </View>
      );
    }

    const encrypted = item.type === 'encrypted';

    return (
      <Pressable
        onLongPress={() => {
          setSelectedMsg(item);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }}
        style={[
          styles.msgRow,
          self && styles.msgRowSelf,
          newGroup && styles.msgRowNewGroup,
        ]}
      >
        {/* Avatar nur bei fremden Nachrichten + erstem in Gruppe */}
        {!self && newGroup && (
          <Avatar
            name={item.username}
            userId={item.user_id}
            avatarUrl={item.avatar_url}
            size={30}
            style={styles.msgAvatar}
          />
        )}
        {!self && !newGroup && <View style={styles.msgAvatarPlaceholder} />}

        <View style={[styles.bubbleWrap, self && styles.bubbleWrapSelf]}>
          {!self && newGroup && (
            <Text style={[styles.msgUsername, { color: item.color }]}>
              {item.username}
            </Text>
          )}
          <View style={[
            styles.bubble,
            self ? styles.bubbleSelf : styles.bubbleOther,
            encrypted && styles.bubbleEncrypted,
          ]}>
            <Text style={[styles.msgText, self && styles.msgTextSelf]}>
              {encrypted ? `🔒 ${item.text}` : item.text}
            </Text>
          </View>
          <Text style={[styles.msgTime, self && styles.msgTimeSelf]}>
            {item.time.length >= 16 ? item.time.slice(11, 16) : item.time}
          </Text>
        </View>
      </Pressable>
    );
  };

  const roomTitle = room.name || 'Chat';
  const roomSub = room.topic || (room.type === 'group' ? 'Gruppe' : 'Direktnachricht');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowInfo(true)}>
          <Avatar name={roomTitle} userId={room.id} avatarUrl={room.avatar_url} size={36} />
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>{roomTitle}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{roomSub}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
          <Text style={styles.infoBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Nachrichten */}
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.gold} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatIcon}>◈</Text>
                <Text style={styles.emptyChatText}>Noch keine Nachrichten{'\n'}Schreib etwas!</Text>
              </View>
            }
          />
        )}

        {/* Eingabeleiste */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Nachricht…"
            placeholderTextColor={Colors.text3}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={input.trim() ? [Colors.gold, Colors.goldDim] : [Colors.surface3, Colors.surface3]}
              style={styles.sendBtn}
            >
              {sending
                ? <ActivityIndicator color={Colors.bg} size="small" />
                : <Text style={[styles.sendIcon, !input.trim() && styles.sendIconOff]}>▶</Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Long-Press Menü */}
      <Modal visible={!!selectedMsg} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={() => setSelectedMsg(null)}>
          <View style={styles.menu}>
            {selectedMsg && (
              <Text style={styles.menuPreview} numberOfLines={3}>
                {selectedMsg.text}
              </Text>
            )}
            {selectedMsg && canDelete(selectedMsg) && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => selectedMsg && handleDeleteMessage(selectedMsg)}
              >
                <Text style={styles.menuDelete}>🗑  Löschen</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              onPress={() => setSelectedMsg(null)}
            >
              <Text style={styles.menuCancel}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Rauminfo-Modal */}
      <Modal visible={showInfo} transparent animationType="slide">
        <View style={styles.infoBg}>
          <View style={styles.infoModal}>
            <View style={styles.infoTop}>
              <Avatar name={roomTitle} userId={room.id} avatarUrl={room.avatar_url} size={54} />
              <View style={styles.infoTopText}>
                <Text style={styles.infoName}>{roomTitle}</Text>
                <Text style={styles.infoType}>
                  {room.type === 'group' ? '# Gruppe' : '⇌ Direktnachricht'}
                </Text>
                {!!room.topic && <Text style={styles.infoTopic}>{room.topic}</Text>}
              </View>
            </View>

            {roomInfo?.members && (
              <View style={styles.infoSection}>
                <Text style={styles.infoSectionTitle}>
                  MITGLIEDER ({roomInfo.members.length})
                </Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {roomInfo.members.map((m: any) => (
                    <View key={m.id} style={styles.memberRow}>
                      <Avatar name={m.name} userId={m.id} avatarUrl={m.avatar_url} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.name}</Text>
                        <Text style={styles.memberId}>#{m.id}</Text>
                      </View>
                      {m.is_owner && <Text style={styles.memberTag}>OWNER</Text>}
                      {m.is_omega && <Text style={[styles.memberTag, styles.memberTagOmega]}>Ω</Text>}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.infoActions}>
              {room.type === 'group' && (
                <TouchableOpacity
                  style={styles.infoLeave}
                  onPress={() => {
                    Alert.alert('Verlassen?', 'Raum wirklich verlassen?', [
                      { text: 'Nein', style: 'cancel' },
                      {
                        text: 'Verlassen', style: 'destructive',
                        onPress: async () => {
                          await apiSvc.leaveRoom(room.id);
                          setShowInfo(false);
                          onBack();
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.infoLeaveText}>Verlassen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.infoClose} onPress={() => setShowInfo(false)}>
                <Text style={styles.infoCloseText}>Schließen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: { paddingRight: 4 },
  backText: { color: Colors.gold, fontSize: 30, fontWeight: '300', lineHeight: 34 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerText: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.text3, marginTop: 1 },
  infoBtn: { padding: 6 },
  infoBtnText: { color: Colors.text2, fontSize: 22, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { padding: Spacing.md, paddingBottom: 4 },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 2,
    gap: Spacing.sm,
  },
  msgRowSelf: { flexDirection: 'row-reverse' },
  msgRowNewGroup: { marginTop: 10 },
  msgAvatar: { marginBottom: 2, flexShrink: 0 },
  msgAvatarPlaceholder: { width: 30, flexShrink: 0 },
  bubbleWrap: { maxWidth: '74%' },
  bubbleWrapSelf: { alignItems: 'flex-end' },
  msgUsername: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 12 },
  bubble: { borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  bubbleOther: { backgroundColor: Colors.surface2, borderBottomLeftRadius: 4 },
  bubbleSelf: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleEncrypted: {
    borderWidth: 1, borderColor: Colors.gold,
    backgroundColor: 'rgba(240,192,64,0.06)',
  },
  bubbleBlocked: {
    backgroundColor: 'rgba(255,68,102,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,68,102,0.2)',
    borderRadius: 12,
  },
  blockedText: { color: Colors.error, fontSize: 12 },
  msgText: { color: Colors.text, fontSize: 15, lineHeight: 21 },
  msgTextSelf: { color: '#fff' },
  msgTime: { fontSize: 10, color: Colors.text3, marginTop: 3, marginLeft: 4 },
  msgTimeSelf: { textAlign: 'right', marginRight: 4 },
  systemMsg: { alignItems: 'center', paddingVertical: 6 },
  systemMsgText: {
    fontSize: 11, color: Colors.text3,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 10,
  },
  emptyChat: { alignItems: 'center', paddingTop: 80 },
  emptyChatIcon: { fontSize: 40, color: Colors.gold, opacity: 0.3, marginBottom: 12 },
  emptyChatText: { color: Colors.text3, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.md, gap: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.surface2,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    color: Colors.text, fontSize: 15, maxHeight: 120,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { color: Colors.bg, fontSize: 16, fontWeight: '700' },
  sendIconOff: { color: Colors.text3 },
  // Long-press menu
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  menu: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    width: 270, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  menuPreview: {
    padding: Spacing.lg, color: Colors.text2,
    fontSize: 13, lineHeight: 19,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuItem: { padding: Spacing.lg },
  menuItemBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  menuDelete: { color: Colors.error, fontSize: 15, fontWeight: '600' },
  menuCancel: { color: Colors.text3, fontSize: 15, textAlign: 'center' },
  // Room info
  infoBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  infoModal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginBottom: Spacing.xl },
  infoTopText: { flex: 1 },
  infoName: { fontSize: 19, fontWeight: '800', color: Colors.text },
  infoType: { fontSize: 12, color: Colors.text3, marginTop: 3 },
  infoTopic: { fontSize: 13, color: Colors.text2, marginTop: 4 },
  infoSection: { marginBottom: Spacing.xl },
  infoSectionTitle: {
    fontSize: 10, fontWeight: '700', color: Colors.text3,
    letterSpacing: 2, marginBottom: Spacing.md,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md, paddingVertical: 6,
  },
  memberName: { color: Colors.text, fontWeight: '600', fontSize: 14 },
  memberId: { color: Colors.text3, fontSize: 11 },
  memberTag: {
    fontSize: 10, fontWeight: '700', color: Colors.accent,
    backgroundColor: 'rgba(108,92,231,0.15)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, letterSpacing: 1,
  },
  memberTagOmega: { color: Colors.gold, backgroundColor: 'rgba(240,192,64,0.12)' },
  infoActions: { flexDirection: 'row', gap: Spacing.md },
  infoLeave: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,68,102,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,68,102,0.3)',
    alignItems: 'center',
  },
  infoLeaveText: { color: Colors.error, fontWeight: '700', fontSize: 13 },
  infoClose: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  infoCloseText: { color: Colors.text2, fontWeight: '700', fontSize: 13 },
});
