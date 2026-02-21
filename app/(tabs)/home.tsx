// app/(tabs)/home.tsx — Prayer times home screen (placeholder)
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { COLORS } from '../../src/constants';

export default function HomeScreen() {
    const { profile } = useAuth();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.greeting}>
                    Assalamu Alaikum{profile?.display_name ? `, ${profile.display_name}` : ''} 🕌
                </Text>
                <Text style={styles.subtitle}>
                    Prayer times and tracking will appear here.
                </Text>

                {/* Placeholder — prayer checklist will be built in Phase 4 */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Today's Prayers</Text>
                    <Text style={styles.cardText}>Coming soon — Phase 4</Text>
                </View>
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
    },
    greeting: {
        fontFamily: 'Inter_700Bold',
        fontSize: 24,
        color: COLORS.textPrimary,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
        color: COLORS.textSecondary,
        marginTop: 4,
        marginBottom: 24,
    },
    card: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    cardTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    cardText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: COLORS.textSecondary,
    },
});
