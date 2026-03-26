export const Colors = {
  bg:           '#0a0a0f',
  surface:      '#111118',
  surface2:     '#1a1a24',
  surface3:     '#22222f',
  border:       '#1e1e2e',
  borderLight:  '#2a2a3e',

  gold:         '#f0c040',
  goldDim:      '#c49a20',

  accent:       '#6c5ce7',
  accentDim:    '#4a3fb5',

  text:         '#f0f0f8',
  text2:        '#8888aa',
  text3:        '#555570',

  success:      '#00e5a0',
  error:        '#ff4466',
  warning:      '#ff9900',

  white:        '#ffffff',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
};

export const Radius = {
  sm:  6,
  md:  12,
  lg:  18,
  xl:  24,
  full: 9999,
};

const AVATAR_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#9b59b6',
  '#e67e22','#1abc9c','#f39c12','#d35400',
  '#c0392b','#8e44ad','#16a085','#27ae60',
  '#2980b9','#f1c40f','#e91e63','#00bcd4',
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  if (!name || name.trim() === '') return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}
