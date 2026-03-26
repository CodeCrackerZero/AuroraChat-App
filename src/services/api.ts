/**
 * API Service — kommuniziert mit dem PHP-Backend
 *
 * Fixes:
 * - `credentials: 'include'` entfernt (funktioniert in React Native nicht nativ)
 * - Cookie wird manuell per Header gesendet
 * - Avatar-URL korrekt zusammengesetzt
 * - sendMessage msg_type korrekt typisiert
 */
import * as SecureStore from 'expo-secure-store';

export const BASE_URL = 'https://irgendwas.net/chat/chat.php';
export const AVATAR_BASE = 'https://irgendwas.net/chat';

interface ApiResponse {
  ok: boolean;
  msg?: string;
  [key: string]: any;
}

let sessionCookie: string | null = null;

export async function loadSession(): Promise<void> {
  try {
    sessionCookie = await SecureStore.getItemAsync('session_cookie');
  } catch {
    sessionCookie = null;
  }
}

export async function clearSession(): Promise<void> {
  sessionCookie = null;
  await SecureStore.deleteItemAsync('session_cookie');
}

function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (sessionCookie) h['Cookie'] = sessionCookie;
  return h;
}

function extractAndSaveCookie(res: Response): void {
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/PHPSESSID=[^;]+/);
    if (match) {
      sessionCookie = match[0];
      SecureStore.setItemAsync('session_cookie', sessionCookie).catch(() => {});
    }
  }
}

export async function checkSession(): Promise<{
  logged_in: boolean;
  id?: string;
  username?: string;
  is_omega?: boolean;
  banned?: boolean;
  avatar_url?: string;
}> {
  const res = await fetch(`${BASE_URL}?check_session`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  extractAndSaveCookie(res);
  return res.json();
}

export async function apiCall(params: Record<string, string>): Promise<ApiResponse> {
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) {
    form.append(k, v);
  }
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: form,
  });
  extractAndSaveCookie(res);
  return res.json();
}

// Auth
export const login = (username: string, password: string) =>
  apiCall({ api: 'login', username, password });
export const register = (username: string, password: string) =>
  apiCall({ api: 'register', username, password });

// Profile
export const getProfile = () => apiCall({ api: 'get_profile' });
export const updateProfile = (display_name: string, bio: string, new_password: string) =>
  apiCall({ api: 'update_profile', display_name, bio, new_password });

// Rooms
export const getRooms = () => apiCall({ api: 'get_rooms' });
export const getRoomInfo = (room_id: string) => apiCall({ api: 'get_room_info', room_id });
export const createDM = (target_id: string) => apiCall({ api: 'create_room', target_id });
export const createGroup = (room_name: string) => apiCall({ api: 'create_group', room_name });
export const leaveRoom = (room_id: string) => apiCall({ api: 'leave_room', room_id });
export const inviteToRoom = (room_id: string, target_id: string) =>
  apiCall({ api: 'invite_room', room_id, target_id });
export const respondInvite = (room_id: string, accept: boolean) =>
  apiCall({ api: 'respond_invite', room_id, accept: accept ? '1' : '0' });
export const getInvites = () => apiCall({ api: 'get_invites' });
export const editRoom = (room_id: string, room_name: string, room_topic: string) =>
  apiCall({ api: 'edit_room', room_id, room_name, room_topic });

// Messages
export const getMessages = (room_id: string) => apiCall({ api: 'get_messages', room_id });
export const sendMessage = (
  room_id: string,
  text: string,
  msg_type: 'text' | 'encrypted' = 'text',
) => apiCall({ api: 'send_msg', room_id, text, msg_type });
export const deleteMessage = (room_id: string, message_id: string) =>
  apiCall({ api: 'delete_msg', room_id, message_id });

// Users
export const searchUser = (user_id: string) => apiCall({ api: 'search_user', user_id });
export const getStatus = () => apiCall({ api: 'get_status' });

// Helpers
export function getAvatarUrl(avatar_url: string | null | undefined): string | null {
  if (!avatar_url) return null;
  if (avatar_url.startsWith('?')) return `${BASE_URL}${avatar_url}`;
  return `${AVATAR_BASE}/${avatar_url}`;
}
