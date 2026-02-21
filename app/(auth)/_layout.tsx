// app/(auth)/_layout.tsx — Auth group layout (login, register, onboarding)
import { Stack } from 'expo-router';
import { COLORS } from '../../src/constants';

export default function AuthLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.bg },
                animation: 'slide_from_right',
            }}
        />
    );
}
