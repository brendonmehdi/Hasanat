// src/hooks/useAuth.ts — Auth hook for session management
import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Profile } from '../types';

export function useAuth() {
    const { session, profile, isLoading, isOnboarded, setSession, setProfile, setLoading, signOut: clearStore } = useAuthStore();

    // Fetch profile from Supabase
    const fetchProfile = useCallback(async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }

        setProfile(data as Profile);
        return data as Profile;
    }, [setProfile]);

    // Initialize auth state — listen for session changes
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            setSession(initialSession);
            if (initialSession?.user) {
                fetchProfile(initialSession.user.id).finally(() => setLoading(false));
            } else {
                setLoading(false);
            }
        });

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                setSession(newSession);
                if (newSession?.user) {
                    await fetchProfile(newSession.user.id);
                } else {
                    setProfile(null);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, [setSession, setProfile, setLoading, fetchProfile]);

    // Sign up with email/password
    const signUp = async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    };

    // Sign in with email/password
    const signIn = async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    };

    // Sign out
    const signOut = async () => {
        await supabase.auth.signOut();
        clearStore();
    };

    return {
        session,
        profile,
        isLoading,
        isOnboarded,
        signUp,
        signIn,
        signOut,
        fetchProfile,
    };
}
