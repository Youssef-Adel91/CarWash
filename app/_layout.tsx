// Powered by OnSpace.AI
import { AlertProvider } from '@/template';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { OrderProvider } from '@/contexts/OrderContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { addNotificationResponseListener, configureNotificationHandler } from '@/services/notificationsService';

// Set the foreground notification presentation behavior once at module
// scope — no need to re-run this on every RootNavigator mount.
configureNotificationHandler();

function RootNavigator() {
  const { user, initializing } = useAuth();
  const { mode, selectedTenant, loading: tenantLoading } = useTenant();
  const { colors, scheme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing || (user && tenantLoading)) return;

    const inAuthFlow = segments[0] === '(auth)' || segments[0] === 'onboarding';

    if (!user) {
      if (!inAuthFlow) router.replace('/onboarding');
      return;
    }

    // Signed in — route to the right "mode" for this user.
    if (mode.kind === 'admin') {
      if (segments[0] !== '(admin)') router.replace('/(admin)/dashboard');
      return;
    }
    if (mode.kind === 'worker') {
      if (segments[0] !== '(worker)') router.replace('/(worker)/jobs');
      return;
    }

    // Customer — lands on the tabs shell (Home) whether or not they've
    // picked a car wash yet. Home itself shows a general landing with a
    // "browse car washes" prompt until selectedTenant is set (see the
    // Places tab); no tenant is forced before the app even opens.
    if (inAuthFlow) {
      router.replace('/(tabs)');
    }
  }, [user, initializing, mode, selectedTenant, tenantLoading, segments, router]);

  // Deep-link when the user taps a push notification: worker jobs for a
  // new order, or the order tracking screen for a status change.
  useEffect(() => {
    const remove = addNotificationResponseListener((data) => {
      if (!data) return;
      if (data.type === 'new_order') {
        router.push('/(worker)/jobs');
      } else if (data.type === 'order_status' && data.orderId) {
        router.push(`/order/${data.orderId}`);
      }
    });
    return remove;
  }, [router]);

  if (initializing || (user && tenantLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AlertProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <TenantProvider>
                <OrderProvider>
                  <RootNavigator />
                </OrderProvider>
              </TenantProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </AlertProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
