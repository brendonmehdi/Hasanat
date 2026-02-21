-- =============================================================================
-- HASANAT — Dev Seed Script
-- Run after migrations: npx supabase db reset (applies migrations + seed)
-- =============================================================================
-- NOTE: In development, auth.users are created via Supabase Auth API.
-- This seed creates profiles + related data for two test users.
-- You must first create these users via the Supabase dashboard or Auth API:
--   User 1: test1@hasanat.dev / password123 → UUID below
--   User 2: test2@hasanat.dev / password123 → UUID below
-- Then replace the UUIDs below with the actual auth.users IDs.
-- =============================================================================

-- For local dev, we can insert directly into auth.users (Supabase local only)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'test1@hasanat.dev',
   crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2222222-2222-2222-2222-222222222222', 'test2@hasanat.dev',
   crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- The trg_on_auth_user_created trigger auto-creates profiles rows,
-- but with empty usernames. Let's update them:
UPDATE public.profiles SET
  username = 'ahmed_test',
  display_name = 'Ahmed (Test)',
  timezone = 'America/New_York',
  latitude = 40.7128,
  longitude = -74.0060
WHERE id = 'a1111111-1111-1111-1111-111111111111';

UPDATE public.profiles SET
  username = 'fatima_test',
  display_name = 'Fatima (Test)',
  timezone = 'America/New_York',
  latitude = 40.7128,
  longitude = -74.0060
WHERE id = 'b2222222-2222-2222-2222-222222222222';

-- Create a friendship between the two test users
INSERT INTO public.friendships (user_id_1, user_id_2)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222'
)
ON CONFLICT DO NOTHING;

-- Sample prayer day timings for today (using EST/New York approximate times)
INSERT INTO public.prayer_day_timings (
  user_id, date, fajr, sunrise, dhuhr, asr, maghrib, isha, midnight,
  calc_method, calc_school, latitude_used, longitude_used, timezone_used
)
VALUES
  ('a1111111-1111-1111-1111-111111111111', CURRENT_DATE,
   (CURRENT_DATE + INTERVAL '5 hours 30 minutes')::TIMESTAMPTZ,  -- Fajr ~5:30 AM
   (CURRENT_DATE + INTERVAL '6 hours 50 minutes')::TIMESTAMPTZ,  -- Sunrise ~6:50 AM
   (CURRENT_DATE + INTERVAL '12 hours 15 minutes')::TIMESTAMPTZ, -- Dhuhr ~12:15 PM
   (CURRENT_DATE + INTERVAL '15 hours 30 minutes')::TIMESTAMPTZ, -- Asr ~3:30 PM
   (CURRENT_DATE + INTERVAL '17 hours 45 minutes')::TIMESTAMPTZ, -- Maghrib ~5:45 PM
   (CURRENT_DATE + INTERVAL '19 hours 0 minutes')::TIMESTAMPTZ,  -- Isha ~7:00 PM
   (CURRENT_DATE + INTERVAL '23 hours 37 minutes')::TIMESTAMPTZ, -- Midnight ~11:37 PM
   2, 0, 40.7128, -74.0060, 'America/New_York'),
  ('b2222222-2222-2222-2222-222222222222', CURRENT_DATE,
   (CURRENT_DATE + INTERVAL '5 hours 30 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '6 hours 50 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '12 hours 15 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '15 hours 30 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '17 hours 45 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '19 hours 0 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '23 hours 37 minutes')::TIMESTAMPTZ,
   2, 0, 40.7128, -74.0060, 'America/New_York')
ON CONFLICT (user_id, date) DO NOTHING;

-- Sample prayer logs for user 1 (test some prayed on-time, some late)
INSERT INTO public.prayer_logs (user_id, date, prayer, status, marked_at, prayer_time, prayer_end_time, points_awarded)
VALUES
  ('a1111111-1111-1111-1111-111111111111', CURRENT_DATE, 'fajr', 'on_time',
   (CURRENT_DATE + INTERVAL '5 hours 45 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '5 hours 30 minutes')::TIMESTAMPTZ,
   (CURRENT_DATE + INTERVAL '6 hours 50 minutes')::TIMESTAMPTZ,
   10)
ON CONFLICT (user_id, date, prayer) DO NOTHING;

-- Corresponding ledger entries
INSERT INTO public.hasanat_ledger (user_id, action, points, date, prayer, idempotency_key)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'prayer_on_time', 10, CURRENT_DATE, 'fajr',
   'a1111111-1111-1111-1111-111111111111:' || CURRENT_DATE::TEXT || ':fajr:prayer_on_time')
ON CONFLICT (idempotency_key) DO NOTHING;

-- Sample fasting log for user 1
INSERT INTO public.fasting_logs (user_id, date, is_fasting, points_awarded)
VALUES
  ('a1111111-1111-1111-1111-111111111111', CURRENT_DATE, TRUE, 20)
ON CONFLICT (user_id, date) DO NOTHING;

INSERT INTO public.hasanat_ledger (user_id, action, points, date, idempotency_key)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'fasting_bonus', 20, CURRENT_DATE,
   'a1111111-1111-1111-1111-111111111111:' || CURRENT_DATE::TEXT || ':fasting_bonus')
ON CONFLICT (idempotency_key) DO NOTHING;
