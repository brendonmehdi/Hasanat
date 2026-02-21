// app/_layout.tsx — Root layout with auth guard, React Query, and font loading
import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useAuth } from '../src/hooks/useAuth';
import { COLORS } from '../src/constants';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 min
            retry: 2,
        },
    },
});

function AuthGuard() {
    const { session, isLoading, isOnboarded } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = segments[0] === '(auth)';

        if (!session && !inAuthGroup) {
            // Not signed in → go to login
            router.replace('/(auth)/login');
        } else if (session && inAuthGroup) {
            // Signed in but in auth screens — check onboarding
            if (isOnboarded) {
                router.replace('/(tabs)/home');
            } else {
                router.replace('/(auth)/onboarding');
            }
        } else if (session && !isOnboarded && segments[0] !== '(auth)') {
            // Signed in, not onboarded, but trying to access main app
            router.replace('/(auth)/onboarding');
        }
    }, [session, isLoading, isOnboarded, segments]);

    if (isLoading) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
        );
    }

    return <Slot />;
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
    });

    if (!fontsLoaded) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <AuthGuard />
        </QueryClientProvider>
    );
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.bg,
    },
});
