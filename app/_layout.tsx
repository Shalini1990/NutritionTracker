import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

const PROJECT_REF = process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF!;
const ACCESS_TOKEN = process.env.EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN!;
const STORAGE_LIMIT_MB = 500;
const WARN_THRESHOLD = 0.8; // warn at 80%

async function checkStorageUsage() {
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/size`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
    const data = await res.json();
    const usedBytes = data?.result?.[0]?.db_size ?? data?.db_size ?? null;
    if (!usedBytes) return;

    const usedMB = usedBytes / (1024 * 1024);
    const usedPct = usedMB / STORAGE_LIMIT_MB;

    if (usedPct >= WARN_THRESHOLD) {
      Alert.alert(
        'Storage Warning',
        `Your database is ${Math.round(usedPct * 100)}% full (${Math.round(usedMB)} MB of ${STORAGE_LIMIT_MB} MB used). Consider exporting old data or upgrading your Supabase plan.`
      );
    }
  } catch {
    // Silently fail — storage check is non-critical
  }
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/(auth)/login');
      return;
    }

    checkStorageUsage();

    supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          router.replace('/(tabs)');
        } else {
          router.replace('/onboarding');
        }
      });
  }, [session, loading]);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="food-form" options={{ headerShown: false }} />
        <Stack.Screen name="scan-label" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
