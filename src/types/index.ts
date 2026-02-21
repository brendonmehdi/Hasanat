// src/types/index.ts — All TypeScript types for the Hasanat app
// Mirrors the Supabase database schema exactly.

// ─── Enums ─────────────────────────────────────────────────────
export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type PrayerStatus = 'on_time' | 'late' | 'missed';
export type LedgerAction = 'prayer_on_time' | 'prayer_late' | 'fasting_bonus' | 'fasting_revoke' | 'missed_prayer';
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';
export type ReactionType = 'like' | 'heart' | 'mashallah' | 'fire';

// ─── Database Row Types ────────────────────────────────────────
export interface Profile {
    id: string;
    username: string;
    username_canonical: string;
    display_name: string | null;
    profile_photo_url: string | null;
    timezone: string;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    updated_at: string;
}

export interface UserSettings {
    user_id: string;
    on_time_window_minutes: number;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    notify_prayer_reminder: boolean;
    notify_friend_prayer: boolean;
    notify_friend_fasting: boolean;
    notify_friend_iftar_post: boolean;
    notify_missed_prayer: boolean;
    created_at: string;
    updated_at: string;
}

export interface PrayerDayTimings {
    id: string;
    user_id: string;
    date: string;
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    midnight: string;
    calc_method: number | null;
    calc_school: number | null;
    latitude_used: number;
    longitude_used: number;
    timezone_used: string;
    retrieved_at: string;
    raw_response: Record<string, unknown> | null;
    created_at: string;
}

export interface PrayerLog {
    id: string;
    user_id: string;
    date: string;
    prayer: PrayerName;
    status: PrayerStatus;
    marked_at: string | null;
    prayer_time: string;
    prayer_end_time: string;
    points_awarded: number;
    created_at: string;
}

export interface FastingLog {
    id: string;
    user_id: string;
    date: string;
    is_fasting: boolean;
    broken: boolean;
    broken_at: string | null;
    points_awarded: number;
    created_at: string;
    updated_at: string;
}

export interface HasanatLedger {
    id: string;
    user_id: string;
    action: LedgerAction;
    points: number;
    date: string;
    prayer: PrayerName | null;
    idempotency_key: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface HasanatTotals {
    user_id: string;
    all_time_total: number;
    updated_at: string;
}

export interface HasanatDailyTotals {
    user_id: string;
    date: string;
    points: number;
    updated_at: string;
}

export interface FriendRequest {
    id: string;
    from_user_id: string;
    to_user_id: string;
    status: FriendRequestStatus;
    created_at: string;
    updated_at: string;
}

export interface Friendship {
    id: string;
    user_id_1: string;
    user_id_2: string;
    created_at: string;
}

export interface DeviceToken {
    id: string;
    user_id: string;
    expo_push_token: string;
    device_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface IftarPost {
    id: string;
    user_id: string;
    image_key: string;
    image_url: string;
    caption: string | null;
    created_at: string;
}

export interface PostReaction {
    id: string;
    post_id: string;
    user_id: string;
    reaction: ReactionType;
    created_at: string;
}

export interface PostComment {
    id: string;
    post_id: string;
    user_id: string;
    content: string;
    created_at: string;
}

// ─── Edge Function Request/Response Types ──────────────────────
export interface AwardPrayerRequest {
    prayer: PrayerName;
    date: string;
}

export interface AwardPrayerResponse {
    success: boolean;
    prayer: PrayerName;
    date: string;
    status: PrayerStatus;
    points: number;
    message: string;
}

export interface SetFastingRequest {
    isFasting: boolean;
    date: string;
}

export interface BreakFastRequest {
    date: string;
}

export interface PresignRequest {
    contentType: string;
    purpose: 'iftar' | 'profile';
}

export interface PresignResponse {
    presignedUrl: string;
    objectKey: string;
    publicUrl: string;
    expiresIn: number;
    maxSizeBytes: number;
}

export interface LeaderboardEntry {
    user_id: string;
    username: string;
    display_name: string | null;
    profile_photo_url: string | null;
    weekly_points?: number;
    total_points?: number;
}

// ─── AlAdhan API Types ─────────────────────────────────────────
export interface AlAdhanTimings {
    Fajr: string;
    Sunrise: string;
    Dhuhr: string;
    Asr: string;
    Maghrib: string;
    Isha: string;
    Midnight: string;
}

export interface AlAdhanMeta {
    method: { id: number; name: string };
    school: string;
    timezone: string;
    latitude: number;
    longitude: number;
}

export interface AlAdhanResponse {
    code: number;
    status: string;
    data: {
        timings: AlAdhanTimings;
        date: {
            readable: string;
            timestamp: string;
            gregorian: { date: string };
            hijri: { date: string };
        };
        meta: AlAdhanMeta;
    };
}
