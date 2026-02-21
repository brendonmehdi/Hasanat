// src/stores/authStore.ts — Zustand store for auth state
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types';

interface AuthState {
    session: Session | null;
    profile: Profile | null;
    isLoading: boolean;
    isOnboarded: boolean; // has username & location set

    setSession: (session: Session | null) => void;
    setProfile: (profile: Profile | null) => void;
    setLoading: (loading: boolean) => void;
    setOnboarded: (onboarded: boolean) => void;
    signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    profile: null,
    isLoading: true,
    isOnboarded: false,

    setSession: (session) =>
        set({ session }),

    setProfile: (profile) =>
        set({
            profile,
            isOnboarded: !!(profile?.username && profile.username !== '' && profile?.latitude),
        }),

    setLoading: (isLoading) =>
        set({ isLoading }),

    setOnboarded: (isOnboarded) =>
        set({ isOnboarded }),

    signOut: () =>
        set({
            session: null,
            profile: null,
            isOnboarded: false,
        }),
}));
