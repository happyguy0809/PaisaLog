// App.tsx
// Entry point. Loads fonts, checks auth, renders navigator.
// No Expo. Pure React Native CLI.
import React, { useEffect, useState } from 'react';
import { Linking, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MMKV } from 'react-native-mmkv';
import { AppNavigator } from './src/navigation';

// ── Query client ──────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime:    30 * 60 * 1000,
      retry: (count, error: any) => {
        if ([401, 403, 404].includes(error?.status)) return false;
        return count < 2;
      },
    },
  },
});

// ── Storage ───────────────────────────────────────────────────
const storage = new MMKV({ id: 'paisalog' });

// ── Root component ────────────────────────────────────────────
export default function App() {
  const [isOnboarded, setIsOnboarded] = useState(
    storage.getString('onboarding_complete') === 'true' &&
    !!storage.getString('access_token')
  );

  useEffect(() => {
    const handleDeepLink = (url: string | null) => {
      if (!url?.startsWith('paisalog://auth')) return;

      // URL.searchParams doesn't work in RN — manual parse
      const tokenMatch = url.match(/[?&]token=([^&]+)/);
      const token = tokenMatch?.[1];

      if (token) {
        const hasAuth =
          storage.getString('onboarding_complete') === 'true' &&
          !!storage.getString('access_token');
        if (hasAuth) setIsOnboarded(true);
      }
    };

    // Cold start — app launched via magic link
    Linking.getInitialURL().then(url => handleDeepLink(url));

    // Warm start — app already open
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle="dark-content" />
          <AppNavigator isOnboarded={isOnboarded} setIsOnboarded={setIsOnboarded} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
