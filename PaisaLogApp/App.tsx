// App.tsx
import React, { useEffect } from 'react';
import { Linking, StatusBar, Animated, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppNavigator, navigationRef } from './src/navigation';
import { start_sms_listener, stop_sms_listener, check_sms_permission } from './src/services/sms';
import { Auth, Tok, storage } from './src/services/api';
import { MPIN } from './src/services/mpin';
import { MPINModal } from './src/components/MPINModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  5 * 60 * 1000,
      gcTime:     30 * 60 * 1000,
      retry: (count, error: any) => {
        if ([401, 403, 404].includes(error?.status)) return false;
        return count < 2;
      },
    },
  },
});

export default function App() {
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  const [isOnboarded, setIsOnboarded] = React.useState(
    storage.getString('onboarding_done') === 'true' &&
    !!Tok.access
  );
  const [appLocked, setAppLocked] = React.useState(false);
  const [lockError, setLockError]  = React.useState('');
  const appState = React.useRef(AppState.currentState);

  // ── Deep link handler — must be inside component to access setIsOnboarded
  // Debug: log token state on mount
  React.useEffect(() => {
    console.log('TOKEN STATE:', {
      has_access: !!Tok.access,
      has_refresh: !!Tok.refresh,
      access_preview: Tok.access?.slice(0, 20),
      onboarding_done: storage.getString('onboarding_done'),
    });
  }, [isOnboarded]);

  async function handleDeepLink(url: string | null) {
    console.log('DEEPLINK FIRED:', url);
    if (!url) return;
    const isDeepLink = url.startsWith('paisalog://auth');
    const isHttpLink = url.includes('/auth/verify');
    if (!isDeepLink && !isHttpLink) return;
    try {
      const queryString = url.includes('?') ? url.split('?')[1] : '';
      const params: Record<string, string> = {};
      queryString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
      });
      const token = params['token'];
      const uid   = params['uid'];
      console.log('PARAMS:', {token: token?.slice(0,10), uid});
      if (!token || !uid) return;

      const result = await Auth.verify(token, parseInt(uid, 10));
      console.log('VERIFY RESULT:', JSON.stringify(result));
      if (result.access_token) {
        Tok.set(result.access_token, result.refresh_token);
        storage.set('onboarding_done', 'true');
        queryClient.clear();
        // Fade out → switch screen → fade in
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setIsOnboarded(true);
          setTimeout(() => {
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          }, 50);
        });
      }
    } catch (e) {
      console.error('Deep link error:', e);
    }
  }

  // App lock — show MPIN when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const lock_enabled = storage.getString('app_lock_enabled') === 'true';
      const was_background = appState.current === 'background' || appState.current === 'inactive';
      if (lock_enabled && was_background && next === 'active' && isOnboarded && MPIN.is_set()) {
        setAppLocked(true);
        setLockError('');
      }
      appState.current = next;
    });
    // Lock immediately on mount if enabled and pin is set
    if (storage.getString('app_lock_enabled') === 'true' && isOnboarded && MPIN.is_set()) {
      setAppLocked(true);
    }
    return () => sub.remove();
  }, [isOnboarded]);

  // Start SMS listener if permission already granted
  useEffect(() => {
    if (!isOnboarded) return;
    check_sms_permission().then(granted => {
      if (granted) start_sms_listener();
    });
    return () => stop_sms_listener();
  }, [isOnboarded]);

  useEffect(() => {
    Linking.getInitialURL().then(url => handleDeepLink(url));
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle="dark-content" />
          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            <AppNavigator isOnboarded={isOnboarded} setIsOnboarded={setIsOnboarded} />
            <MPINModal
              visible={appLocked && isOnboarded}
              mode="enter"
              title="PaisaLog"
              subtitle="Enter your PIN to continue"
              error={lockError}
              onSuccess={(pin) => {
                if (MPIN.verify(pin)) {
                  setAppLocked(false);
                  setLockError('');
                } else {
                  setLockError('Wrong PIN. Try again.');
                }
              }}
              onCancel={() => {}}
              onForgotPin={() => {
                // Sign out — only recovery option
                Tok.clear();
                storage.delete('onboarding_done');
                setAppLocked(false);
                setIsOnboarded(false);
              }}
            />
          </Animated.View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
