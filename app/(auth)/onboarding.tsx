// app/(auth)/onboarding.tsx — Onboarding: set username + location
import { useState, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator, ScrollView,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { useAuthStore } from '../../src/stores/authStore';
import { COLORS, MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH } from '../../src/constants';

const USERNAME_REGEX = /^[a-zA-Z0-9._]{3,20}$/;

export default function OnboardingScreen() {
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [timezone, setTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
    const { session, fetchProfile } = useAuth();
    const router = useRouter();

    const requestLocation = useCallback(async () => {
        setLocationLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Location Required',
                    'Hasanat needs your location to fetch accurate prayer times for your area. Please enable location in Settings.',
                );
                return;
            }

            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        } catch (error) {
            Alert.alert('Error', 'Could not get your location. Please try again.');
        } finally {
            setLocationLoading(false);
        }
    }, []);

    const handleComplete = useCallback(async () => {
        // Validate username
        if (!USERNAME_REGEX.test(username)) {
            Alert.alert(
                'Invalid Username',
                `Username must be ${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} characters. Only letters, numbers, dots, and underscores allowed.`,
            );
            return;
        }

        if (!location) {
            Alert.alert('Location Required', 'Please set your location to get accurate prayer times.');
            return;
        }

        setLoading(true);
        try {
            // Check username availability
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('username_canonical', username.toLowerCase())
                .neq('id', session!.user.id)
                .limit(1);

            if (existing && existing.length > 0) {
                Alert.alert('Username Taken', 'This username is already in use. Please choose another.');
                setLoading(false);
                return;
            }

            // Update profile
            const { error } = await supabase
                .from('profiles')
                .update({
                    username: username,
                    display_name: displayName.trim() || null,
                    latitude: location.lat,
                    longitude: location.lng,
                    timezone: timezone,
                })
                .eq('id', session!.user.id);

            if (error) throw error;

            // Refresh profile in store
            await fetchProfile(session!.user.id);

            // Navigate to main app
            router.replace('/(tabs)/home');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to save profile.');
        } finally {
            setLoading(false);
        }
    }, [username, displayName, location, timezone, session, fetchProfile, router]);

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Welcome! 🕌</Text>
                        <Text style={styles.subtitle}>
                            Let's set up your profile so you can track prayers and connect with friends.
                        </Text>
                    </View>

                    {/* Username */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Choose a Username</Text>
                        <Text style={styles.hint}>
                            {MIN_USERNAME_LENGTH}–{MAX_USERNAME_LENGTH} chars. Letters, numbers, dots, underscores.
                        </Text>
                        <TextInput
                            style={styles.input}
                            placeholder="your.username"
                            placeholderTextColor={COLORS.textMuted}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={MAX_USERNAME_LENGTH}
                        />
                    </View>

                    {/* Display Name (optional) */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Display Name (optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="How friends see you"
                            placeholderTextColor={COLORS.textMuted}
                            value={displayName}
                            onChangeText={setDisplayName}
                            maxLength={50}
                        />
                    </View>

                    {/* Location */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Location</Text>
                        <Text style={styles.hint}>
                            Required for accurate prayer times based on your area.
                        </Text>

                        {location ? (
                            <View style={styles.locationSet}>
                                <Text style={styles.locationText}>
                                    📍 Location set ({location.lat.toFixed(2)}°, {location.lng.toFixed(2)}°)
                                </Text>
                                <Text style={styles.locationTimezone}>🕐 {timezone}</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.locationButton}
                                onPress={requestLocation}
                                disabled={locationLoading}
                                activeOpacity={0.8}
                            >
                                {locationLoading ? (
                                    <ActivityIndicator color={COLORS.accent} />
                                ) : (
                                    <Text style={styles.locationButtonText}>📍 Set My Location</Text>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Submit */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            (!username || !location || loading) && styles.buttonDisabled,
                        ]}
                        onPress={handleComplete}
                        disabled={!username || !location || loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color={COLORS.textInverse} />
                        ) : (
                            <Text style={styles.buttonText}>Start Tracking 🚀</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingVertical: 32,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 36,
    },
    title: {
        fontFamily: 'Inter_700Bold',
        fontSize: 32,
        color: COLORS.textPrimary,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 16,
        color: COLORS.textSecondary,
        marginTop: 8,
        lineHeight: 24,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: COLORS.textPrimary,
        marginBottom: 4,
    },
    hint: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: COLORS.textMuted,
        marginBottom: 10,
    },
    input: {
        fontFamily: 'Inter_400Regular',
        fontSize: 16,
        color: COLORS.textPrimary,
        backgroundColor: COLORS.bgInput,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    locationButton: {
        backgroundColor: COLORS.bgElevated,
        borderWidth: 1,
        borderColor: COLORS.accent,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderStyle: 'dashed',
    },
    locationButtonText: {
        fontFamily: 'Inter_500Medium',
        fontSize: 15,
        color: COLORS.accent,
    },
    locationSet: {
        backgroundColor: COLORS.greenGlow,
        borderWidth: 1,
        borderColor: COLORS.green,
        borderRadius: 12,
        padding: 14,
        gap: 4,
    },
    locationText: {
        fontFamily: 'Inter_500Medium',
        fontSize: 14,
        color: COLORS.green,
    },
    locationTimezone: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: COLORS.textSecondary,
    },
    button: {
        backgroundColor: COLORS.accent,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: COLORS.textInverse,
    },
});
