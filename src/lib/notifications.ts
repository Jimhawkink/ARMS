/**
 * notifications.ts
 * Real OS-level phone notifications — appear in notification shade
 * like WhatsApp even when app is open, minimized, or backgrounded.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

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
    if (!Device.isDevice) return false; // emulator — skip

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;

    if (existing !== 'granted') {
        const { status: asked } = await Notifications.requestPermissionsAsync();
        status = asked;
    }

    if (status !== 'granted') return false;

    // Android: create high-priority channel (like WhatsApp)
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('arms_messages', {
            name: 'ARMS Messages',
            importance: Notifications.AndroidImportance.HIGH,
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
 * Fire an immediate OS notification — appears in notification shade.
 * Works when app is open, minimized, or in background.
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
            trigger: null, // Fire immediately
        });
    } catch { /* silent — never crash for notifications */ }
}
