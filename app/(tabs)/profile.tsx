// app/(tabs)/profile.tsx — Profile screen with editable name, photo, stats, friends
import { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Alert,
    ScrollView, TextInput, Image, ActivityIndicator,
    Platform, ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/hooks/useAuth';
import { useHasanatTotals } from '../../src/hooks/useHasanatTotals';
import { useFriendsList, usePendingRequests } from '../../src/hooks/useFriends';
import { supabase } from '../../src/lib/supabase';
import { uploadToS3 } from '../../src/lib/s3';
import { useAuthStore } from '../../src/stores/authStore';
import { COLORS } from '../../src/constants';

export default function ProfileScreen() {
    const router = useRouter();
    const { profile, signOut, session } = useAuth();
    const { data: totals } = useHasanatTotals();
    const { data: friends } = useFriendsList();
    const { data: pending } = usePendingRequests();
    const setProfile = useAuthStore((s) => s.setProfile);

    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(profile?.display_name || '');
    const [savingName, setSavingName] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const handleSignOut = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ]);
    };

    // ─── Edit Display Name ──────────────────────────────────
    const handleEditName = () => {
        setNewName(profile?.display_name || '');
        setEditingName(true);
    };

    const handleSaveName = async () => {
        const trimmed = newName.trim();
        if (!trimmed) {
            Alert.alert('Error', 'Display name cannot be empty.');
            return;
        }
        if (trimmed.length > 50) {
            Alert.alert('Error', 'Display name must be 50 characters or less.');
            return;
        }

        setSavingName(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ display_name: trimmed })
                .eq('id', profile?.id);

            if (error) throw error;

            // Update local state
            if (profile) {
                setProfile({ ...profile, display_name: trimmed });
            }
            setEditingName(false);
            Alert.alert('Updated!', 'Your display name has been changed.');
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update name.');
        } finally {
            setSavingName(false);
        }
    };

    // ─── Profile Photo ──────────────────────────────────────
    const handleChangePhoto = useCallback(() => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', '📷 Take Photo', '🖼️ Choose from Library'],
                    cancelButtonIndex: 0,
                },
                (buttonIndex) => {
                    if (buttonIndex === 1) pickPhoto('camera');
                    if (buttonIndex === 2) pickPhoto('library');
                },
            );
        } else {
            Alert.alert('Profile Photo', 'Choose an option', [
                { text: 'Cancel', style: 'cancel' },
                { text: '📷 Take Photo', onPress: () => pickPhoto('camera') },
                { text: '🖼️ Choose from Library', onPress: () => pickPhoto('library') },
            ]);
        }
    }, []);

    const pickPhoto = async (source: 'camera' | 'library') => {
        try {
            let result: ImagePicker.ImagePickerResult;

            if (source === 'camera') {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission needed', 'Camera access is required.');
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });
            } else {
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });
            }

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            const mimeType = asset.mimeType || 'image/jpeg';

            setUploadingPhoto(true);

            // Upload to Storage
            const { publicUrl } = await uploadToS3(asset.uri, mimeType, 'profile');

            // Update profile in DB
            const { error } = await supabase
                .from('profiles')
                .update({ profile_photo_url: publicUrl })
                .eq('id', profile?.id);

            if (error) throw error;

            // Update local state
            if (profile) {
                setProfile({ ...profile, profile_photo_url: publicUrl });
            }
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update photo.');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const initial = (profile?.display_name || profile?.username || '?')[0].toUpperCase();

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Profile 👤</Text>

                {/* Profile info */}
                <View style={styles.card}>
                    {/* Avatar — tap to change photo */}
                    <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto}>
                        {uploadingPhoto ? (
                            <View style={styles.avatar}>
                                <ActivityIndicator color={COLORS.accent} />
                            </View>
                        ) : profile?.profile_photo_url ? (
                            <Image
                                source={{ uri: profile.profile_photo_url }}
                                style={styles.avatarImage}
                            />
                        ) : (
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initial}</Text>
                            </View>
                        )}
                        <View style={styles.cameraBadge}>
                            <Text style={styles.cameraBadgeText}>📷</Text>
                        </View>
                    </TouchableOpacity>

                    <View style={styles.info}>
                        {/* Display name — editable */}
                        {editingName ? (
                            <View style={styles.editRow}>
                                <TextInput
                                    style={styles.nameInput}
                                    value={newName}
                                    onChangeText={setNewName}
                                    maxLength={50}
                                    autoFocus
                                    returnKeyType="done"
                                    onSubmitEditing={handleSaveName}
                                />
                                <TouchableOpacity onPress={handleSaveName} disabled={savingName}>
                                    {savingName ? (
                                        <ActivityIndicator color={COLORS.accent} size="small" />
                                    ) : (
                                        <Text style={styles.saveBtn}>Save</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setEditingName(false)}>
                                    <Text style={styles.cancelBtn}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity onPress={handleEditName} style={styles.nameRow}>
                                <Text style={styles.displayName}>
                                    {profile?.display_name || profile?.username || 'Unknown'}
                                </Text>
                                <Text style={styles.editIcon}>✏️</Text>
                            </TouchableOpacity>
                        )}

                        {profile?.username ? (
                            <Text style={styles.username}>@{profile.username}</Text>
                        ) : null}
                        <Text style={styles.email}>{session?.user?.email}</Text>
                    </View>
                </View>

                {/* Stats */}
                <View style={styles.statsCard}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{totals?.all_time_total || 0}</Text>
                        <Text style={styles.statLabel}>Hasanat</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <TouchableOpacity
                        style={styles.statItem}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.statValue}>{friends?.length || 0}</Text>
                        <Text style={styles.statLabel}>Friends</Text>
                    </TouchableOpacity>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                            {profile?.timezone?.split('/').pop()?.replace(/_/g, ' ') || '—'}
                        </Text>
                        <Text style={styles.statLabel}>Location</Text>
                    </View>
                </View>

                {/* Pending requests badge */}
                {pending && pending.length > 0 && (
                    <TouchableOpacity
                        style={styles.pendingBanner}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.pendingText}>
                            📩 {pending.length} pending friend request{pending.length > 1 ? 's' : ''}
                        </Text>
                        <Text style={styles.pendingCta}>View →</Text>
                    </TouchableOpacity>
                )}

                {/* Quick links */}
                <View style={styles.linksCard}>
                    <TouchableOpacity
                        style={styles.linkRow}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.linkEmoji}>👥</Text>
                        <Text style={styles.linkText}>Friends</Text>
                        <Text style={styles.linkArrow}>→</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.linkRow, { borderBottomWidth: 0 }]}
                        onPress={() => router.push('/settings')}
                    >
                        <Text style={styles.linkEmoji}>⚙️</Text>
                        <Text style={styles.linkText}>Settings</Text>
                        <Text style={styles.linkArrow}>→</Text>
                    </TouchableOpacity>
                </View>

                {/* Sign out */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    activeOpacity={0.7}
                >
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 16 },
    title: {
        fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.textPrimary,
        letterSpacing: -0.5, marginBottom: 8,
    },

    // Profile Card
    card: {
        backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 16,
    },
    avatar: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: COLORS.accentGlow, borderWidth: 2, borderColor: COLORS.accent,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarImage: {
        width: 64, height: 64, borderRadius: 32,
        borderWidth: 2, borderColor: COLORS.accent,
    },
    avatarText: { fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.accent },
    cameraBadge: {
        position: 'absolute', bottom: -2, right: -2,
        backgroundColor: COLORS.bgElevated, borderRadius: 10,
        width: 22, height: 22, justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: COLORS.border,
    },
    cameraBadgeText: { fontSize: 12 },

    info: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    displayName: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: COLORS.textPrimary },
    editIcon: { fontSize: 14 },
    username: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
    email: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

    // Edit name inline
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameInput: {
        flex: 1, fontFamily: 'Inter_500Medium', fontSize: 16, color: COLORS.textPrimary,
        backgroundColor: COLORS.bgInput, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
        borderWidth: 1, borderColor: COLORS.accent,
    },
    saveBtn: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.accent },
    cancelBtn: { fontSize: 16, color: COLORS.textMuted, paddingHorizontal: 4 },

    // Stats
    statsCard: {
        backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: COLORS.border,
        flexDirection: 'row', alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.accent },
    statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
    statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },

    // Pending banner
    pendingBanner: {
        backgroundColor: COLORS.accentGlow, borderRadius: 12, padding: 14,
        borderWidth: 1, borderColor: COLORS.accent,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    pendingText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.accent },
    pendingCta: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.accent },

    // Quick links
    linksCard: {
        backgroundColor: COLORS.bgCard, borderRadius: 16,
        borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    },
    linkRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    linkEmoji: { fontSize: 20 },
    linkText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: COLORS.textPrimary, flex: 1 },
    linkArrow: { fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.textMuted },

    // Sign out
    signOutButton: {
        backgroundColor: COLORS.bgElevated, borderRadius: 12, padding: 16,
        alignItems: 'center', borderWidth: 1, borderColor: COLORS.error, marginTop: 8,
    },
    signOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.error },
});
