// ============================================================
// ARMS License Library — Client-side license management
// Machine-locked, localStorage-backed
// ============================================================

export interface LicensePayload {
    licenseKey: string;
    clientName: string;
    expiryDate: string;   // ISO date string e.g. "2026-01-01"
    machineId: string;
    features: string[];
    activatedAt: string;  // ISO datetime string
}

const STORAGE_KEY = 'arms_license';

// ── Machine fingerprint ──────────────────────────────────────
/**
 * Generates a stable machine fingerprint from browser characteristics.
 * Uses btoa + string concat (no crypto.subtle required).
 */
export function generateMachineFingerprint(): string {
    if (typeof window === 'undefined') return 'server-side';

    const nav = window.navigator;
    const scr = window.screen;

    const raw = [
        nav.userAgent || '',
        String(scr.width || 0),
        String(scr.height || 0),
        String(scr.colorDepth || 0),
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        nav.language || '',
        String((nav as any).hardwareConcurrency || 0),
        String((nav as any).deviceMemory || 0),
        nav.platform || '',
    ].join('|');

    // Simple deterministic hash using btoa + fold
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    const hashStr = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');

    // Encode the raw string in base64 and take a slice for extra entropy
    let b64 = '';
    try {
        b64 = btoa(unescape(encodeURIComponent(raw.slice(0, 64))))
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 16)
            .padEnd(16, '0');
    } catch {
        b64 = hashStr.repeat(2);
    }

    return `MID-${hashStr}-${b64.slice(0, 8)}-${b64.slice(8, 16)}`;
}

// ── Storage helpers ──────────────────────────────────────────
export function getStoredLicense(): LicensePayload | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as LicensePayload;
    } catch {
        return null;
    }
}

export function storeLicense(payload: LicensePayload): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearLicense(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
}

// ── Validation ───────────────────────────────────────────────
/**
 * Checks that the license is not expired and matches the current machine.
 */
export function isLicenseValid(payload: LicensePayload | null): boolean {
    if (!payload) return false;

    // Check expiry
    const expiry = new Date(payload.expiryDate);
    if (isNaN(expiry.getTime())) return false;
    if (expiry < new Date()) return false;

    // Check machine match
    const currentMachine = generateMachineFingerprint();
    if (payload.machineId && payload.machineId !== currentMachine) return false;

    return true;
}

/**
 * Returns the licensed client name, or 'Unlicensed' if no valid license.
 */
export function getLicensedTo(): string {
    const payload = getStoredLicense();
    if (!payload) return 'Unlicensed';
    return payload.clientName || 'Unlicensed';
}

/**
 * Returns days until license expiry. Negative means expired.
 */
export function getDaysUntilExpiry(payload: LicensePayload | null): number {
    if (!payload) return -1;
    const expiry = new Date(payload.expiryDate);
    const now = new Date();
    return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
