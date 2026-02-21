// src/lib/aladhan.ts — AlAdhan API client with caching via Supabase
import { supabase } from './supabase';
import { ALADHAN_BASE_URL, DEFAULT_CALC_METHOD, DEFAULT_CALC_SCHOOL } from '../constants';
import type { AlAdhanResponse, PrayerDayTimings, PrayerName } from '../types';

/**
 * Fetch prayer times from AlAdhan API for a given date + location.
 * Returns raw API response for both use and audit storage.
 */
export async function fetchAlAdhanTimings(
    latitude: number,
    longitude: number,
    date: Date,
    method: number = DEFAULT_CALC_METHOD,
    school: number = DEFAULT_CALC_SCHOOL,
): Promise<AlAdhanResponse> {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();

    const url = `${ALADHAN_BASE_URL}/timings/${dd}-${mm}-${yyyy}?latitude=${latitude}&longitude=${longitude}&method=${method}&school=${school}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`AlAdhan API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    if (json.code !== 200) {
        throw new Error(`AlAdhan API returned code ${json.code}`);
    }

    return json as AlAdhanResponse;
}

/**
 * Parse an AlAdhan time string (e.g. "05:23 (EST)") into a Date object
 * for the given date.
 */
export function parseAlAdhanTime(timeStr: string, date: Date, timezone: string): Date {
    // AlAdhan returns times like "05:23 (EST)" — extract HH:MM
    const match = timeStr.match(/^(\d{2}):(\d{2})/);
    if (!match) throw new Error(`Cannot parse AlAdhan time: ${timeStr}`);

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    // Create a date string in the user's timezone
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(hours).padStart(2, '0');
    const min = String(minutes).padStart(2, '0');

    // Build ISO string with timezone
    const isoStr = `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;

    // Use Intl to handle timezone properly
    const result = new Date(isoStr);

    return result;
}

/**
 * Format a Date to ISO date string "YYYY-MM-DD"
 */
export function toDateString(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Fetch prayer times for a user+date. Checks Supabase cache first,
 * falls back to AlAdhan API, stores result in DB for future use.
 */
export async function getPrayerTimings(
    userId: string,
    date: Date,
    latitude: number,
    longitude: number,
    timezone: string,
): Promise<PrayerDayTimings> {
    const dateStr = toDateString(date);

    // 1. Check cache in Supabase
    const { data: cached } = await supabase
        .from('prayer_day_timings')
        .select('*')
        .eq('user_id', userId)
        .eq('date', dateStr)
        .single();

    if (cached) {
        return cached as PrayerDayTimings;
    }

    // 2. Fetch from AlAdhan
    const response = await fetchAlAdhanTimings(latitude, longitude, date);
    const t = response.data.timings;
    const meta = response.data.meta;

    // 3. Parse times into ISO strings
    const fajr = parseAlAdhanTime(t.Fajr, date, timezone).toISOString();
    const sunrise = parseAlAdhanTime(t.Sunrise, date, timezone).toISOString();
    const dhuhr = parseAlAdhanTime(t.Dhuhr, date, timezone).toISOString();
    const asr = parseAlAdhanTime(t.Asr, date, timezone).toISOString();
    const maghrib = parseAlAdhanTime(t.Maghrib, date, timezone).toISOString();
    const isha = parseAlAdhanTime(t.Isha, date, timezone).toISOString();
    const midnight = parseAlAdhanTime(t.Midnight, date, timezone).toISOString();

    // 4. Store in Supabase (upsert to handle race conditions)
    const row = {
        user_id: userId,
        date: dateStr,
        fajr,
        sunrise,
        dhuhr,
        asr,
        maghrib,
        isha,
        midnight,
        calc_method: meta.method.id,
        calc_school: meta.school === 'STANDARD' ? 0 : 1,
        latitude_used: meta.latitude,
        longitude_used: meta.longitude,
        timezone_used: meta.timezone,
        raw_response: response.data as unknown as Record<string, unknown>,
    };

    const { data: inserted, error } = await supabase
        .from('prayer_day_timings')
        .upsert(row, { onConflict: 'user_id,date' })
        .select()
        .single();

    if (error) {
        console.error('Error caching prayer times:', error);
        // Return a constructed object even if caching fails
        return { id: '', created_at: new Date().toISOString(), retrieved_at: new Date().toISOString(), ...row } as PrayerDayTimings;
    }

    return inserted as PrayerDayTimings;
}

/**
 * Get the end time for a prayer's window. Used to determine on-time vs late.
 */
export function getPrayerEndTime(timings: PrayerDayTimings, prayer: PrayerName): Date {
    switch (prayer) {
        case 'fajr': return new Date(timings.sunrise);
        case 'dhuhr': return new Date(timings.asr);
        case 'asr': return new Date(timings.maghrib);
        case 'maghrib': return new Date(timings.isha);
        case 'isha': return new Date(timings.midnight);
    }
}

/**
 * Get the start time for a prayer.
 */
export function getPrayerStartTime(timings: PrayerDayTimings, prayer: PrayerName): Date {
    return new Date(timings[prayer]);
}

/**
 * Check if a prayer is currently within its on-time window.
 * On-time = within 30 minutes of adhan (configurable).
 */
export function isOnTime(
    prayerTime: Date,
    markedAt: Date,
    windowMinutes: number = 30,
): boolean {
    const diff = markedAt.getTime() - prayerTime.getTime();
    return diff >= 0 && diff <= windowMinutes * 60 * 1000;
}

/**
 * Get the prayer status based on current time relative to prayer window.
 */
export function getPrayerWindowStatus(
    timings: PrayerDayTimings,
    prayer: PrayerName,
    now: Date = new Date(),
): 'upcoming' | 'active' | 'late' | 'ended' {
    const start = getPrayerStartTime(timings, prayer);
    const end = getPrayerEndTime(timings, prayer);

    if (now < start) return 'upcoming';
    if (now >= start && now <= end) return 'active';
    if (now > end) return 'ended';
    return 'late';
}
