// app/(tabs)/feed.tsx — Iftar feed screen (placeholder)
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../src/constants';

export default function FeedScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Iftar Feed 🍽️</Text>
                <Text style={styles.subtitle}>See what your friends are having for iftar.</Text>

                <View style={styles.card}>
                    <Text style={styles.cardText}>Coming soon — Phase 6</Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    title: { fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, color: COLORS.textSecondary, marginTop: 4, marginBottom: 24 },
    card: { backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
    cardText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary },
});
