/**
 * notifications.ts — v3 FCM Edition
 * Uses @react-native-firebase/messaging for real FCM push tokens.
 * Works even when app is COMPLETELY CLOSED — exactly like WhatsApp.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import messaging from '@react-native-firebase/messaging';

// Show notification even when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function setupNotifications(): Promise<boolean> {
    if (!Device.isDevice) return false;

    // Request FCM permission via Firebase
    const authStatus = await messaging().requestPermission();
    const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) return false;

    // Also request Expo notification permission for local notifications
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing !== 'granted') {
        await Notifications.requestPermissionsAsync();
    }

    // Android: create high-priority channel (like WhatsApp)
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('arms_messages', {
            name: 'ARMS Messages',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6366f1',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
        });
        await Notifications.setNotificationChannelAsync('arms_alerts', {
            name: 'ARMS Alerts',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            showBadge: true,
        });
    }

    return true;
}

/**
 * Get FCM token and save to Supabase.
 * Called after login — enables web app to push to this phone even when closed.
 */
export async function registerPushToken(tenantId: number): Promise<void> {
    try {
        if (!Device.isDevice) return;

        // Get real FCM token (works in bare Gradle builds — no EAS needed)
        const fcmToken = await messaging().getToken();
        if (!fcmToken) return;

        console.log('[FCM token]', fcmToken.substring(0, 20) + '...');

        // Save to Supabase so web app can send push notifications
        await supabase
            .from('arms_tenants')
            .update({ push_token: fcmToken })
            .eq('tenant_id', tenantId);

        // Listen for foreground FCM messages → show local notification
        messaging().onMessage(async remoteMessage => {
            const title = remoteMessage.notification?.title || '💬 ARMS Message';
            const body = remoteMessage.notification?.body || 'You have a new message';
            await pushNotification(title, body, 'arms_messages');
        });

    } catch (err) {
        console.warn('[push token]', err);
    }
}

/**
 * Stop all notification subscriptions (call on logout).
 */
export function stopNotifications(): void {
    // FCM handles background — nothing to teardown manually
}

/**
 * Fire an immediate local OS notification.
 */
export async function pushNotification(
    title: string,
    body: string,
    channelId: 'arms_messages' | 'arms_alerts' = 'arms_messages',
    data?: Record<string, any>,
): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                data: data || {},
                ...(Platform.OS === 'android' ? { channelId } : {}),
            },
            trigger: null,
        });
    } catch { /* silent */ }
}
