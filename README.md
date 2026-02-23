# Hasanat

An Islamic prayer companion app built with React Native and Expo. Track daily prayers, fasting, earn Hasanat points, and stay connected with friends on their spiritual journey.

## Features

### Prayer Tracking
- Automatic prayer time calculation based on your location using the AlAdhan API
- Mark prayers as completed with on-time, late, or missed status tracking
- Points awarded based on prayer timeliness
- Local push notification reminders before each prayer

### Fasting
- Daily fasting status declaration with bonus Hasanat points
- Break fast tracking with point adjustment
- Friends are notified when you begin or break your fast

### Social
- Add friends by username and view their prayer activity
- Weekly leaderboard ranked by Hasanat points
- Iftar post feed with photo sharing, reactions, and comments
- Push notifications for friend activity (fasting, prayers, posts)

### Profile and Settings
- Profile photo upload (stored in Supabase Storage)
- Configurable notification preferences per category
- Quiet hours to suppress notifications during specific times
- Block and remove friends

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54, React Native 0.81 |
| Routing | Expo Router (file-based) |
| State | Zustand (auth store), React Query (server state) |
| Backend | Supabase (Auth, Postgres, Edge Functions, Storage) |
| Notifications | expo-notifications (local + remote via Expo Push Service) |
| Media Storage | Supabase Storage (buckets) |
| Prayer Times | AlAdhan API |
| Language | TypeScript |

## Project Structure

```
hasanat/
  app/                        # Expo Router screens
    (auth)/                   # Login, registration, onboarding
    (tabs)/                   # Main tab screens
      home.tsx                # Prayer checklist + fasting card
      leaderboard.tsx         # Weekly friend rankings
      feed.tsx                # Iftar post feed
      profile.tsx             # User profile + stats
    friends.tsx               # Friend list and requests
    settings.tsx              # Notification and account settings
    _layout.tsx               # Root layout with auth guard
  src/
    hooks/                    # React Query hooks
      useAuth.ts              # Session management
      usePrayerTimes.ts       # Prayer time fetching
      usePrayerLogs.ts        # Prayer logging mutations
      useFasting.ts           # Fasting status
      useFeed.ts              # Iftar posts, reactions, comments
      useFriends.ts           # Friend requests and list
      useLeaderboard.ts       # Weekly rankings
      useHasanatTotals.ts     # Point totals
      useNotificationSetup.ts # Push registration + prayer reminders
    lib/
      supabase.ts             # Supabase client init
      aladhan.ts              # Prayer time API integration
      notifications.ts        # Push token registration + scheduling
      edgeFn.ts               # Edge Function caller
      s3.ts                   # Storage upload helper
    stores/
      authStore.ts            # Zustand auth state
    types/
      index.ts                # TypeScript type definitions
    constants.ts              # Colors, prayer names, point values
  supabase/
    migrations/
      001_initial_schema.sql  # Full database schema
    functions/                # Deno Edge Functions
      _shared/                # Shared auth, push, rate-limit helpers
      award-prayer-hasanat/   # Score prayer and award points
      missed-prayer-job/      # Cron job for missed prayer detection
      set-fasting-status/     # Set fasting + notify friends
      break-fast/             # Break fast + revoke points
      friend-request/         # Send friend request + notify
      accept-friend-request/  # Accept request + notify
      decline-friend-request/ # Decline request
      remove-friend/          # Remove friendship
      block-user/             # Block user
      create-iftar-post/      # Upload iftar post + notify friends
      comment-on-post/        # Add comment to post
      react-to-post/          # Add reaction to post
```

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- A Supabase project
- An Expo account (for push notifications)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/hasanat.git
   cd hasanat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```

   Required variables:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. Run the database migration against your Supabase project:
   ```bash
   npx supabase db push
   ```

5. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy
   ```

6. Start the development server:
   ```bash
   npm start
   ```

### Building for iOS

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Update `eas.json` with your Apple Developer credentials before submitting.

## Database Schema

The schema includes these core tables:

- **profiles** -- User identity with location and photo
- **user_settings** -- Notification preferences and quiet hours
- **prayer_day_timings** -- Cached prayer times per user per day
- **prayer_logs** -- Recorded prayer completions with status
- **hasanat_ledger** -- Point transaction log
- **fasting_logs** -- Daily fasting records
- **friendships** -- Accepted friend pairs
- **friend_requests** -- Pending friend requests
- **blocks** -- User blocks
- **device_tokens** -- Expo push tokens per device
- **iftar_posts** -- Photo posts with captions
- **post_reactions** -- Reactions on posts
- **post_comments** -- Comments on posts

Row Level Security (RLS) is enforced on all tables. Users can only access their own data and their friends' shared activity.

## Push Notifications

The app supports both local and remote push notifications:

- **Local**: Prayer time reminders scheduled on-device, 5 minutes before each prayer
- **Remote**: Friend activity notifications (fasting, prayers, posts, friend requests) sent via Expo Push Service through Supabase Edge Functions

Push tokens are registered automatically on login and refreshed when the app returns to foreground.

## License

This project is private and not licensed for redistribution.
