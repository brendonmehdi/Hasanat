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
    const rawSegments = useSegments() as string[];
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = rawSegments[0] === '(auth)';
        const inTabsGroup = rawSegments[0] === '(tabs)';

        // Determine where the user SHOULD be
        let targetRoute: string | null = null;

        if (!session) {
            // Not signed in → should be in auth group
            if (!inAuthGroup) {
                targetRoute = '/(auth)/login';
            }
        } else if (!isOnboarded) {
            // Signed in but not onboarded → should be on onboarding
            // Only redirect if NOT already on the onboarding screen
            const currentScreen = rawSegments[1];
            if (currentScreen !== 'onboarding') {
                targetRoute = '/(auth)/onboarding';
            }
        } else {
            // Signed in AND onboarded → should be in tabs
            if (inAuthGroup) {
                targetRoute = '/(tabs)/home';
            }
        }

        // Only navigate if we actually need to change routes
        if (targetRoute) {
            router.replace(targetRoute as any);
        }
    }, [session, isLoading, isOnboarded]);
    // NOTE: removed `segments` from deps to prevent re-fire loop

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
