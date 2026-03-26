/**
 * Avatar Component
 *
 * Fixes:
 * - Image onError-Fallback auf Initialen
 * - size als Prop korrekt zu allen Style-Werten weitergegeben
 */
import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getAvatarUrl } from '../services/api';
import { avatarColor, getInitials } from '../utils/theme';

interface Props {
  name: string;
  userId: string;
  avatarUrl?: string | null;
  size?: number;
  style?: object;
}

export function Avatar({ name, userId, avatarUrl, size = 42, style }: Props) {
  const [imgError, setImgError] = useState(false);
  const color = avatarColor(userId);
  const initials = getInitials(name);
  const url = (!imgError && avatarUrl) ? getAvatarUrl(avatarUrl) : null;
  const r = size / 2;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: r, backgroundColor: color },
        style,
      ]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: r }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(10, size * 0.36) }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
