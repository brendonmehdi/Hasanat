// src/lib/notifications.ts — Push notification registration
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Register for push notifications and store the token in Supabase.
 * Returns the Expo push token string or null if not available.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
    // Push notifications only work on physical devices
    if (!Device.isDevice) {
        console.log('Push notifications require a physical device.');
        return null;
    }

    // Check & request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted.');
        return null;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: undefined, // Uses projectId from app.json automatically
    });
    const token = tokenData.data;

    // Store in Supabase (upsert to handle re-registrations)
    const { error } = await supabase
        .from('device_tokens')
        .upsert(
            {
                user_id: userId,
                expo_push_token: token,
                device_name: Device.deviceName || `${Device.brand} ${Device.modelName}`,
            },
            { onConflict: 'user_id,expo_push_token' },
        );

    if (error) {
        console.error('Failed to store push token:', error);
    }

    // Set notification channel for Android
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('prayer-reminders', {
            name: 'Prayer Reminders',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
        });
    }

    return token;
}

/**
 * Schedule a local notification for a prayer time.
 */
export async function schedulePrayerReminder(
    prayerName: string,
    prayerTime: Date,
    minutesBefore: number = 5,
): Promise<string | null> {
    const triggerDate = new Date(prayerTime.getTime() - minutesBefore * 60 * 1000);

    // Don't schedule if time has already passed
    if (triggerDate <= new Date()) return null;

    const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: `${prayerName} is approaching 🕌`,
            body: `${prayerName} in ${minutesBefore} minutes. Get ready to pray!`,
            sound: 'default',
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
        },
    });

    return id;
}

/**
 * Cancel all scheduled notifications (e.g., when logging out).
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}
