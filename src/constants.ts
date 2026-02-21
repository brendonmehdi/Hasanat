// src/constants.ts — App-wide constants

// ─── Points ────────────────────────────────────────────────────
export const POINTS = {
    PRAYER_ON_TIME: 10,
    PRAYER_LATE: 5,
    PRAYER_MISSED: 0,
    FASTING_BONUS: 20,
    FASTING_REVOKE: -20,
} as const;

// ─── Prayer Names ──────────────────────────────────────────────
export const PRAYER_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

export const PRAYER_LABELS: Record<string, string> = {
    fajr: 'Fajr',
    dhuhr: 'Dhuhr',
    asr: 'Asr',
    maghrib: 'Maghrib',
    isha: 'Isha',
};

export const PRAYER_EMOJI: Record<string, string> = {
    fajr: '🌅',
    dhuhr: '☀️',
    asr: '🌤️',
    maghrib: '🌇',
    isha: '🌙',
};

// ─── API ───────────────────────────────────────────────────────
export const ALADHAN_BASE_URL = 'https://api.aladhan.com/v1';

// Default calculation method: Islamic Society of North America (ISNA)
export const DEFAULT_CALC_METHOD = 2;
// Default school: Shafi'i (1) — affects only Asr timing
export const DEFAULT_CALC_SCHOOL = 1;

// ─── Reactions ─────────────────────────────────────────────────
export const REACTION_EMOJI: Record<string, string> = {
    like: '👍',
    heart: '❤️',
    mashallah: '✨',
    fire: '🔥',
};

// ─── Limits ────────────────────────────────────────────────────
export const MAX_CAPTION_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 300;
export const MAX_USERNAME_LENGTH = 20;
export const MIN_USERNAME_LENGTH = 3;

// ─── Colors (dark theme) ───────────────────────────────────────
export const COLORS = {
    // Base
    bg: '#0D1117',
    bgCard: '#161B22',
    bgElevated: '#1C2128',
    bgInput: '#21262D',

    // Text
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    textMuted: '#484F58',
    textInverse: '#0D1117',

    // Accent
    accent: '#C084FC',        // Purple
    accentLight: '#D8B4FE',
    accentDark: '#9333EA',
    accentGlow: 'rgba(192, 132, 252, 0.15)',

    // Islamic green
    green: '#22C55E',
    greenLight: '#4ADE80',
    greenDark: '#16A34A',
    greenGlow: 'rgba(34, 197, 94, 0.15)',

    // Status
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Gold (for leaderboard)
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',

    // Borders
    border: '#30363D',
    borderLight: '#484F58',

    // Shadows
    shadow: 'rgba(0, 0, 0, 0.3)',
} as const;
