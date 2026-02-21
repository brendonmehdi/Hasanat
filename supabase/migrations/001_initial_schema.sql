-- =============================================================================
-- HASANAT — Complete Database Schema
-- Migration 001: Initial schema with all tables, indexes, RLS, triggers
-- =============================================================================
-- IMPORTANT: Run this ENTIRE file at once in the Supabase SQL Editor.
-- Do NOT run it in pieces — tables must exist before policies reference them.
-- =============================================================================
-- Islamic Midnight Rule (LOCKED):
--   midnight = sunset_time + ((next_fajr - sunset_time) / 2)
--   AlAdhan returns this as the "Midnight" field. We store it directly.
--   This is the Shafi'i/Hanbali "true midnight" (midpoint Sunset↔Fajr).
-- =============================================================================

-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- PHASE 1: EXTENSIONS + ENUMS
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE public.prayer_name AS ENUM ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha');
CREATE TYPE public.prayer_status AS ENUM ('on_time', 'late', 'missed');
CREATE TYPE public.ledger_action AS ENUM (
  'prayer_on_time', 'prayer_late', 'fasting_bonus', 'fasting_revoke', 'missed_prayer'
);
CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE public.reaction_type AS ENUM ('like', 'heart', 'mashallah', 'fire');


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- PHASE 2: ALL TABLES (no RLS yet — avoids forward reference errors)
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- 1. PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL DEFAULT '',
  username_canonical TEXT NOT NULL DEFAULT '',
  display_name TEXT,
  profile_photo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_username_format CHECK (
    username = '' OR username ~ '^[a-zA-Z0-9._]{3,20}$'
  ),
  CONSTRAINT profiles_username_canonical_format CHECK (
    username_canonical = '' OR username_canonical ~ '^[a-z0-9._]{3,20}$'
  ),
  CONSTRAINT profiles_display_name_length CHECK (
    display_name IS NULL OR (LENGTH(display_name) BETWEEN 1 AND 50)
  )
);

CREATE UNIQUE INDEX idx_profiles_username_canonical
  ON public.profiles(username_canonical) WHERE username_canonical != '';
CREATE INDEX idx_profiles_username ON public.profiles(username);


-- 2. USER SETTINGS
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  on_time_window_minutes INT NOT NULL DEFAULT 30
    CHECK (on_time_window_minutes BETWEEN 5 AND 120),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  notify_prayer_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  notify_friend_prayer BOOLEAN NOT NULL DEFAULT TRUE,
  notify_friend_fasting BOOLEAN NOT NULL DEFAULT TRUE,
  notify_friend_iftar_post BOOLEAN NOT NULL DEFAULT FALSE,
  notify_missed_prayer BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 3. PRAYER DAY TIMINGS
CREATE TABLE public.prayer_day_timings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  fajr TIMESTAMPTZ NOT NULL,
  sunrise TIMESTAMPTZ NOT NULL,
  dhuhr TIMESTAMPTZ NOT NULL,
  asr TIMESTAMPTZ NOT NULL,
  maghrib TIMESTAMPTZ NOT NULL,
  isha TIMESTAMPTZ NOT NULL,
  midnight TIMESTAMPTZ NOT NULL,
  calc_method INT,
  calc_school INT,
  latitude_used DOUBLE PRECISION NOT NULL,
  longitude_used DOUBLE PRECISION NOT NULL,
  timezone_used TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_prayer_day_timings UNIQUE (user_id, date)
);

CREATE INDEX idx_prayer_day_timings_user_date ON public.prayer_day_timings(user_id, date);


-- 4. PRAYER LOGS
CREATE TABLE public.prayer_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  prayer prayer_name NOT NULL,
  status prayer_status NOT NULL,
  marked_at TIMESTAMPTZ,
  prayer_time TIMESTAMPTZ NOT NULL,
  prayer_end_time TIMESTAMPTZ NOT NULL,
  points_awarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- IDEMPOTENCY: one log per user+date+prayer
  CONSTRAINT uq_prayer_log UNIQUE (user_id, date, prayer)
);

CREATE INDEX idx_prayer_logs_user_date ON public.prayer_logs(user_id, date);
CREATE INDEX idx_prayer_logs_status ON public.prayer_logs(status) WHERE status = 'missed';


-- 5. FASTING LOGS
CREATE TABLE public.fasting_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_fasting BOOLEAN NOT NULL DEFAULT FALSE,
  broken BOOLEAN NOT NULL DEFAULT FALSE,
  broken_at TIMESTAMPTZ,
  points_awarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- IDEMPOTENCY: one fasting log per user+date
  CONSTRAINT uq_fasting_log UNIQUE (user_id, date)
);

CREATE INDEX idx_fasting_logs_user_date ON public.fasting_logs(user_id, date);


-- 6. HASANAT LEDGER
CREATE TABLE public.hasanat_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action ledger_action NOT NULL,
  points INT NOT NULL,
  date DATE NOT NULL,
  prayer prayer_name,
  idempotency_key TEXT NOT NULL,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- IDEMPOTENCY: unique key prevents double awards
  CONSTRAINT uq_ledger_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_ledger_user_date ON public.hasanat_ledger(user_id, date);
CREATE INDEX idx_ledger_user ON public.hasanat_ledger(user_id);


-- 7. HASANAT TOTALS (all-time)
CREATE TABLE public.hasanat_totals (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  all_time_total INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 8. HASANAT DAILY TOTALS (for weekly leaderboard)
CREATE TABLE public.hasanat_daily_totals (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  points INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX idx_daily_totals_date ON public.hasanat_daily_totals(date);
CREATE INDEX idx_daily_totals_user_date ON public.hasanat_daily_totals(user_id, date);


-- 9. FRIEND REQUESTS
CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status friend_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT friend_request_not_self CHECK (from_user_id != to_user_id),
  CONSTRAINT uq_friend_request UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX idx_friend_requests_to ON public.friend_requests(to_user_id) WHERE status = 'pending';
CREATE INDEX idx_friend_requests_from ON public.friend_requests(from_user_id);


-- 10. FRIENDSHIPS
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT friendship_ordered CHECK (user_id_1 < user_id_2),
  CONSTRAINT uq_friendship UNIQUE (user_id_1, user_id_2)
);

CREATE INDEX idx_friendships_user1 ON public.friendships(user_id_1);
CREATE INDEX idx_friendships_user2 ON public.friendships(user_id_2);


-- 11. BLOCKS
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT block_not_self CHECK (blocker_id != blocked_id),
  CONSTRAINT uq_block UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON public.blocks(blocked_id);


-- 12. DEVICE TOKENS
CREATE TABLE public.device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_device_token UNIQUE (user_id, expo_push_token)
);

CREATE INDEX idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX idx_device_tokens_token ON public.device_tokens(expo_push_token);


-- 13. IFTAR POSTS
CREATE TABLE public.iftar_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT iftar_post_caption_length CHECK (
    caption IS NULL OR LENGTH(caption) <= 500
  ),
  CONSTRAINT iftar_post_key_prefix CHECK (image_key LIKE 'users/%')
);

CREATE INDEX idx_iftar_posts_user ON public.iftar_posts(user_id);
CREATE INDEX idx_iftar_posts_created ON public.iftar_posts(created_at DESC);


-- 14. POST REACTIONS
CREATE TABLE public.post_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.iftar_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction reaction_type NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_post_reaction UNIQUE (post_id, user_id)
);

CREATE INDEX idx_reactions_post ON public.post_reactions(post_id);


-- 15. POST COMMENTS
CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.iftar_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT comment_content_length CHECK (LENGTH(content) BETWEEN 1 AND 300)
);

CREATE INDEX idx_comments_post ON public.post_comments(post_id, created_at);


-- 16. AUDIT EVENTS
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_events_user ON public.audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_events_type ON public.audit_events(event_type);


-- 17. RATE LIMITS
CREATE TABLE public.rate_limits (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action)
);


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- PHASE 3: FUNCTIONS + TRIGGERS (after all tables exist)
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- Auto-populate username_canonical on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.fn_set_username_canonical()
RETURNS TRIGGER AS $$
BEGIN
  NEW.username_canonical := LOWER(NEW.username);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_username_canonical
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_username_canonical();

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_user();

-- Auto-create settings + totals on profile creation
CREATE OR REPLACE FUNCTION public.fn_create_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.hasanat_totals (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_create_user_defaults
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_create_user_defaults();

-- Update hasanat_totals + hasanat_daily_totals on ledger INSERT
CREATE OR REPLACE FUNCTION public.fn_update_hasanat_totals()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.hasanat_totals (user_id, all_time_total, updated_at)
  VALUES (NEW.user_id, NEW.points, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET all_time_total = hasanat_totals.all_time_total + NEW.points,
        updated_at = NOW();

  INSERT INTO public.hasanat_daily_totals (user_id, date, points, updated_at)
  VALUES (NEW.user_id, NEW.date, NEW.points, NOW())
  ON CONFLICT (user_id, date) DO UPDATE
    SET points = hasanat_daily_totals.points + NEW.points,
        updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_hasanat_totals
  AFTER INSERT ON public.hasanat_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_hasanat_totals();


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- PHASE 4: HELPER FUNCTIONS (used by Edge Functions via service role)
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- Get all accepted friend IDs for a user
CREATE OR REPLACE FUNCTION public.fn_get_friend_ids(target_user_id UUID)
RETURNS SETOF UUID AS $$
  SELECT CASE
    WHEN user_id_1 = target_user_id THEN user_id_2
    ELSE user_id_1
  END
  FROM public.friendships
  WHERE user_id_1 = target_user_id OR user_id_2 = target_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get Expo push tokens for a user's accepted friends (privacy-safe)
CREATE OR REPLACE FUNCTION public.fn_get_friend_push_tokens(
  target_user_id UUID,
  notification_type TEXT DEFAULT 'friend_prayer'
)
RETURNS TABLE (token TEXT, friend_id UUID) AS $$
  SELECT dt.expo_push_token, f_id
  FROM public.fn_get_friend_ids(target_user_id) AS f_id
  JOIN public.device_tokens dt ON dt.user_id = f_id
  JOIN public.user_settings us ON us.user_id = f_id
  WHERE
    NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.blocker_id = f_id AND b.blocked_id = target_user_id
    )
    AND CASE notification_type
      WHEN 'friend_prayer' THEN us.notify_friend_prayer
      WHEN 'friend_fasting' THEN us.notify_friend_fasting
      WHEN 'friend_iftar_post' THEN us.notify_friend_iftar_post
      WHEN 'missed_prayer' THEN us.notify_missed_prayer
      ELSE TRUE
    END
    AND (
      us.quiet_hours_start IS NULL
      OR us.quiet_hours_end IS NULL
      OR NOT (
        CASE
          WHEN us.quiet_hours_start <= us.quiet_hours_end THEN
            CURRENT_TIME BETWEEN us.quiet_hours_start AND us.quiet_hours_end
          ELSE
            CURRENT_TIME >= us.quiet_hours_start OR CURRENT_TIME <= us.quiet_hours_end
        END
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if two users are friends
CREATE OR REPLACE FUNCTION public.fn_are_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id_1 = LEAST(user_a, user_b) AND user_id_2 = GREATEST(user_a, user_b)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if blocked in either direction
CREATE OR REPLACE FUNCTION public.fn_is_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get prayer end time for missed detection
CREATE OR REPLACE FUNCTION public.fn_get_prayer_end_time(
  p_user_id UUID, p_date DATE, p_prayer prayer_name
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  timings RECORD;
BEGIN
  SELECT * INTO timings
  FROM public.prayer_day_timings
  WHERE user_id = p_user_id AND date = p_date;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN CASE p_prayer
    WHEN 'fajr'    THEN timings.sunrise
    WHEN 'dhuhr'   THEN timings.asr
    WHEN 'asr'     THEN timings.maghrib
    WHEN 'maghrib' THEN timings.isha
    WHEN 'isha'    THEN timings.midnight
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Leaderboard: weekly (rolling 7 days)
CREATE OR REPLACE FUNCTION public.fn_get_weekly_leaderboard(requesting_user_id UUID)
RETURNS TABLE (
  user_id UUID, username TEXT, display_name TEXT,
  profile_photo_url TEXT, weekly_points BIGINT
) AS $$
  SELECT p.id, p.username, p.display_name, p.profile_photo_url,
    COALESCE(SUM(dt.points), 0) AS weekly_points
  FROM public.profiles p
  LEFT JOIN public.hasanat_daily_totals dt
    ON dt.user_id = p.id AND dt.date >= CURRENT_DATE - INTERVAL '6 days'
  WHERE p.id = requesting_user_id
     OR EXISTS (
       SELECT 1 FROM public.friendships f
       WHERE (f.user_id_1 = requesting_user_id AND f.user_id_2 = p.id)
          OR (f.user_id_2 = requesting_user_id AND f.user_id_1 = p.id)
     )
  GROUP BY p.id, p.username, p.display_name, p.profile_photo_url
  ORDER BY weekly_points DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Leaderboard: all-time
CREATE OR REPLACE FUNCTION public.fn_get_alltime_leaderboard(requesting_user_id UUID)
RETURNS TABLE (
  user_id UUID, username TEXT, display_name TEXT,
  profile_photo_url TEXT, total_points INT
) AS $$
  SELECT p.id, p.username, p.display_name, p.profile_photo_url,
    COALESCE(ht.all_time_total, 0) AS total_points
  FROM public.profiles p
  LEFT JOIN public.hasanat_totals ht ON ht.user_id = p.id
  WHERE p.id = requesting_user_id
     OR EXISTS (
       SELECT 1 FROM public.friendships f
       WHERE (f.user_id_1 = requesting_user_id AND f.user_id_2 = p.id)
          OR (f.user_id_2 = requesting_user_id AND f.user_id_1 = p.id)
     )
  ORDER BY total_points DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Rate limit check (returns TRUE if allowed)
CREATE OR REPLACE FUNCTION public.fn_check_rate_limit(
  p_user_id UUID, p_action TEXT,
  p_max_requests INT DEFAULT 10, p_window_seconds INT DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
  v_record RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_record
  FROM public.rate_limits
  WHERE user_id = p_user_id AND action = p_action
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, v_now, 1);
    RETURN TRUE;
  END IF;

  IF v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL < v_now THEN
    UPDATE public.rate_limits
    SET window_start = v_now, request_count = 1
    WHERE user_id = p_user_id AND action = p_action;
    RETURN TRUE;
  END IF;

  IF v_record.request_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id AND action = p_action;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- PHASE 5: ENABLE RLS ON ALL TABLES
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_day_timings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hasanat_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hasanat_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hasanat_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iftar_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- PHASE 6: ALL RLS POLICIES (all tables exist, safe to reference any table)
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- ═══════════════ PROFILES ═══════════════
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_friends" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = id)
         OR (f.user_id_2 = auth.uid() AND f.user_id_1 = id)
    )
  );

CREATE POLICY "profiles_select_by_username" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- ═══════════════ USER SETTINGS ═══════════════
CREATE POLICY "settings_select_own" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "settings_update_own" ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_insert_own" ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ═══════════════ PRAYER DAY TIMINGS ═══════════════
CREATE POLICY "timings_select_own" ON public.prayer_day_timings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "timings_insert_own" ON public.prayer_day_timings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "timings_update_own" ON public.prayer_day_timings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ═══════════════ PRAYER LOGS ═══════════════
CREATE POLICY "prayer_logs_select_own" ON public.prayer_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "prayer_logs_select_friends" ON public.prayer_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = user_id)
         OR (f.user_id_2 = auth.uid() AND f.user_id_1 = user_id)
    )
  );

-- Only Edge Functions (service role) insert prayer logs
CREATE POLICY "prayer_logs_insert_service" ON public.prayer_logs
  FOR INSERT WITH CHECK (false);


-- ═══════════════ FASTING LOGS ═══════════════
CREATE POLICY "fasting_logs_select_own" ON public.fasting_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "fasting_logs_select_friends" ON public.fasting_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = user_id)
         OR (f.user_id_2 = auth.uid() AND f.user_id_1 = user_id)
    )
  );

CREATE POLICY "fasting_logs_insert_service" ON public.fasting_logs
  FOR INSERT WITH CHECK (false);

CREATE POLICY "fasting_logs_update_service" ON public.fasting_logs
  FOR UPDATE USING (false);


-- ═══════════════ HASANAT LEDGER ═══════════════
CREATE POLICY "ledger_select_own" ON public.hasanat_ledger
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ledger_insert_service" ON public.hasanat_ledger
  FOR INSERT WITH CHECK (false);


-- ═══════════════ HASANAT TOTALS ═══════════════
CREATE POLICY "totals_select_own" ON public.hasanat_totals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "totals_select_friends" ON public.hasanat_totals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = user_id)
         OR (f.user_id_2 = auth.uid() AND f.user_id_1 = user_id)
    )
  );


-- ═══════════════ HASANAT DAILY TOTALS ═══════════════
CREATE POLICY "daily_totals_select_own" ON public.hasanat_daily_totals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "daily_totals_select_friends" ON public.hasanat_daily_totals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = user_id)
         OR (f.user_id_2 = auth.uid() AND f.user_id_1 = user_id)
    )
  );


-- ═══════════════ FRIEND REQUESTS ═══════════════
CREATE POLICY "fr_select_involved" ON public.friend_requests
  FOR SELECT USING (auth.uid() IN (from_user_id, to_user_id));

CREATE POLICY "fr_insert_service" ON public.friend_requests
  FOR INSERT WITH CHECK (false);

CREATE POLICY "fr_update_service" ON public.friend_requests
  FOR UPDATE USING (false);

CREATE POLICY "fr_delete_service" ON public.friend_requests
  FOR DELETE USING (false);


-- ═══════════════ FRIENDSHIPS ═══════════════
CREATE POLICY "friendships_select_own" ON public.friendships
  FOR SELECT USING (auth.uid() IN (user_id_1, user_id_2));

CREATE POLICY "friendships_insert_service" ON public.friendships
  FOR INSERT WITH CHECK (false);

CREATE POLICY "friendships_delete_service" ON public.friendships
  FOR DELETE USING (false);


-- ═══════════════ BLOCKS ═══════════════
CREATE POLICY "blocks_select_own" ON public.blocks
  FOR SELECT USING (auth.uid() = blocker_id);

CREATE POLICY "blocks_insert_service" ON public.blocks
  FOR INSERT WITH CHECK (false);

CREATE POLICY "blocks_delete_service" ON public.blocks
  FOR DELETE USING (false);


-- ═══════════════ DEVICE TOKENS ═══════════════
CREATE POLICY "tokens_select_own" ON public.device_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tokens_insert_own" ON public.device_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tokens_update_own" ON public.device_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tokens_delete_own" ON public.device_tokens
  FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════ IFTAR POSTS ═══════════════
CREATE POLICY "posts_select_own" ON public.iftar_posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "posts_select_friends" ON public.iftar_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = user_id)
         OR (f.user_id_2 = auth.uid() AND f.user_id_1 = user_id)
    )
  );

CREATE POLICY "posts_insert_service" ON public.iftar_posts
  FOR INSERT WITH CHECK (false);

CREATE POLICY "posts_delete_own" ON public.iftar_posts
  FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════ POST REACTIONS ═══════════════
CREATE POLICY "reactions_select" ON public.post_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.iftar_posts p
      WHERE p.id = post_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = p.user_id)
               OR (f.user_id_2 = auth.uid() AND f.user_id_1 = p.user_id)
          )
        )
    )
  );

CREATE POLICY "reactions_insert_service" ON public.post_reactions
  FOR INSERT WITH CHECK (false);

CREATE POLICY "reactions_delete_own" ON public.post_reactions
  FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════ POST COMMENTS ═══════════════
CREATE POLICY "comments_select" ON public.post_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.iftar_posts p
      WHERE p.id = post_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE (f.user_id_1 = auth.uid() AND f.user_id_2 = p.user_id)
               OR (f.user_id_2 = auth.uid() AND f.user_id_1 = p.user_id)
          )
        )
    )
  );

CREATE POLICY "comments_insert_service" ON public.post_comments
  FOR INSERT WITH CHECK (false);

CREATE POLICY "comments_delete_own" ON public.post_comments
  FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════ AUDIT EVENTS (service only) ═══════════════
CREATE POLICY "audit_service_only" ON public.audit_events
  FOR ALL USING (false);


-- ═══════════════ RATE LIMITS (service only) ═══════════════
CREATE POLICY "rate_limits_service_only" ON public.rate_limits
  FOR ALL USING (false);


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- REFERENCE: IDEMPOTENCY CONSTRAINTS + POINTS LOGIC
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- DB-LEVEL IDEMPOTENCY:
-- 1. prayer_logs:         UNIQUE(user_id, date, prayer)
-- 2. fasting_logs:        UNIQUE(user_id, date)
-- 3. hasanat_ledger:      UNIQUE(idempotency_key)
-- 4. friend_requests:     UNIQUE(from_user_id, to_user_id)
-- 5. friendships:         UNIQUE(user_id_1, user_id_2)
-- 6. blocks:              UNIQUE(blocker_id, blocked_id)
-- 7. device_tokens:       UNIQUE(user_id, expo_push_token)
-- 8. post_reactions:      UNIQUE(post_id, user_id)
-- 9. prayer_day_timings:  UNIQUE(user_id, date)

-- POINTS LOGIC:
--   +10: Prayed within on-time window (default 30 min after adhan)
--   +5:  Prayed after on-time window but before prayer end
--   0:   Missed (no log by end window, cron creates missed event)
--   +20: Fasting bonus (once per day)
--   -20: Fast broken (revokes bonus)
--
-- PRAYER END WINDOWS:
--   Fajr    → Sunrise
--   Dhuhr   → Asr start
--   Asr     → Maghrib start
--   Maghrib → Isha start
--   Isha    → Islamic Midnight (midpoint Sunset↔Fajr, from AlAdhan)
