// Powered by OnSpace.AI
// Expo push notifications: token registration (writes to public.push_tokens,
// see supabase/migrations/0003_push_notifications.sql) + a thin listener
// wrapper for deep-linking on notification tap. Every function here is
// best-effort and never throws — push is a nice-to-have, not something
// that should ever crash the app (especially in Expo Go on SDK 53+, where
// remote push requires a dev build and getExpoPushTokenAsync rejects).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

/** Sets the app-wide notification presentation handler. expo-notifications
 * ~0.31 requires shouldShowBanner/shouldShowList in its return type
 * (shouldShowAlert was deprecated in favor of them); we set all of
 * shouldShowAlert/shouldShowBanner/shouldShowList so this type-checks
 * against that version and stays compatible with slightly older ones too. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Requests permission, grabs an Expo push token for this device, and
 * upserts it into push_tokens for `userId`. Returns the token, or null if
 * push isn't available here (web, simulator/emulator, permission denied,
 * Expo Go without a dev build, no network, etc.) — never throws. */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    if (!Device.isDevice) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId ?? undefined;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    if (!token) return null;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );
    if (error) {
      console.log('registerForPushNotifications upsert error:', error.message);
      return null;
    }

    return token;
  } catch (err) {
    // Covers Expo Go (SDK 53+) rejecting remote push, missing projectId,
    // simulators, or any other push-unavailable environment.
    console.log('registerForPushNotifications failed:', err);
    return null;
  }
}

/** Best-effort cleanup on logout — removes this device's token so a
 * signed-out device stops receiving pushes for the old user. */
export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  try {
    const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
    if (error) console.log('unregisterPushToken error:', error.message);
  } catch (err) {
    console.log('unregisterPushToken failed:', err);
  }
}

/** Subscribes to notification taps (foreground, background, or cold
 * start via the initial response) and forwards the `data` payload set by
 * the SQL triggers, e.g. {type: 'new_order', orderId, tenantId} or
 * {type: 'order_status', orderId, status}. Returns an unsubscribe fn. */
export function addNotificationResponseListener(onTap: (data: any) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    onTap(data);
  });
  return () => subscription.remove();
}
