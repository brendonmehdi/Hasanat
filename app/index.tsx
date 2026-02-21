// app/index.tsx — Root redirect (prevents "Unmatched Route" on cold start)
import { Redirect } from 'expo-router';

export default function Index() {
    // The AuthGuard in _layout.tsx will handle the actual redirect
    // to /(auth)/login or /(tabs)/home. This just provides a valid route
    // for the initial "/" path so Expo Router doesn't show "Unmatched Route".
    return <Redirect href="/(auth)/login" />;
}
