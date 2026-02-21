// app/(tabs)/profile.tsx — Profile screen with sign out
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { COLORS } from '../../src/constants';

export default function ProfileScreen() {
    const { profile, signOut, session } = useAuth();

    const handleSignOut = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: signOut,
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Profile 👤</Text>

                {/* Profile info */}
                <View style={styles.card}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
                        </Text>
                    </View>

                    <View style={styles.info}>
                        <Text style={styles.displayName}>
                            {profile?.display_name || profile?.username || 'Unknown'}
                        </Text>
                        {profile?.username ? (
                            <Text style={styles.username}>@{profile.username}</Text>
                        ) : null}
                        <Text style={styles.email}>{session?.user?.email}</Text>
                    </View>
                </View>

                {/* Stats placeholder */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Your Stats</Text>
                    <Text style={styles.cardText}>
                        Points, streak, and stats coming in Phase 4.
                    </Text>
                </View>

                {/* Sign out */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    activeOpacity={0.7}
                >
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 16,
    },
    title: {
        fontFamily: 'Inter_700Bold',
        fontSize: 24,
        color: COLORS.textPrimary,
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    card: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: COLORS.accentGlow,
        borderWidth: 2,
        borderColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontFamily: 'Inter_700Bold',
        fontSize: 22,
        color: COLORS.accent,
    },
    info: {
        flex: 1,
    },
    displayName: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        color: COLORS.textPrimary,
    },
    username: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    email: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    cardTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    cardText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: COLORS.textSecondary,
        flex: 1,
    },
    signOutButton: {
        backgroundColor: COLORS.bgElevated,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.error,
        marginTop: 'auto',
        marginBottom: 24,
    },
    signOutText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 15,
        color: COLORS.error,
    },
});
