// ============================================================
// ARMS — Role-Based Access Control (RBAC)
// Defines which routes each role can access
// Super Admin bypasses ALL checks
// ============================================================

export type ARMSRole = 'admin' | 'manager' | 'caretaker' | 'viewer' | 'agent' | 'owner';

// ── Route permission map ──────────────────────────────────────
// Maps route prefixes to the permission flag required
// Super Admin always passes regardless of this map
export const ROUTE_PERMISSIONS: Record<string, keyof RolePermissions | 'super_admin_only'> = {
    '/dashboard/settings':      'super_admin_only',   // Super Admin ONLY
    '/dashboard/licensing':     'super_admin_only',   // Super Admin ONLY
    '/dashboard/users':         'can_manage_users',
    '/dashboard/sms':           'can_send_sms',
    '/dashboard/demand-letters':'can_issue_demand_letters',
    '/dashboard/tenants':       'can_manage_tenants',
    '/dashboard/billing':       'can_manage_billing',
    '/dashboard/payments':      'can_record_payments',
    '/dashboard/unpaid':        'can_view_reports',
    '/dashboard/units':         'can_manage_units',
    '/dashboard/locations':     'can_manage_units',
    '/dashboard/utilities':     'can_manage_utilities',
    '/dashboard/prepaid':       'can_manage_utilities',
    '/dashboard/expenses':      'can_manage_expenses',
    '/dashboard/reports':       'can_view_reports',
    '/dashboard/caretakers':    'can_manage_caretakers',
    '/dashboard/petty-cash':    'can_manage_expenses',
    '/dashboard/checklists':    'can_manage_checklists',
    '/dashboard':               'can_view_dashboard',
};

export interface RolePermissions {
    can_manage_tenants: boolean;
    can_manage_units: boolean;
    can_record_payments: boolean;
    can_view_reports: boolean;
    can_send_sms: boolean;
    can_manage_utilities: boolean;
    can_manage_caretakers: boolean;
    can_issue_demand_letters: boolean;
    can_manage_settings: boolean;
    can_manage_users: boolean;
    can_view_dashboard: boolean;
    can_manage_expenses: boolean;
    can_manage_billing: boolean;
    can_manage_checklists: boolean;
    is_super_admin: boolean;
}

export interface ARMSUser {
    userId: number;
    userName: string;
    name: string;
    userType: string;
    userRole: string;
    isSuperAdmin: boolean;
    permissions?: RolePermissions;
}

// ── Check if a user can access a route ───────────────────────
export function canAccessRoute(user: ARMSUser | null, pathname: string): boolean {
    if (!user) return false;

    // Super Admin bypasses everything
    if (user.isSuperAdmin) return true;

    // Find the most specific matching route
    const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
        .filter(route => pathname === route || pathname.startsWith(route + '/'))
        .sort((a, b) => b.length - a.length)[0]; // longest match wins

    if (!matchedRoute) return true; // No restriction defined = allow

    const requiredPerm = ROUTE_PERMISSIONS[matchedRoute];

    // Super admin only routes — block everyone else
    if (requiredPerm === 'super_admin_only') return false;

    // Check the specific permission
    if (!user.permissions) return false;
    return user.permissions[requiredPerm as keyof RolePermissions] === true;
}

// ── Get visible sidebar items for a user ─────────────────────
export function getVisibleRoutes(user: ARMSUser | null): Set<string> {
    if (!user) return new Set();
    if (user.isSuperAdmin) return new Set(Object.keys(ROUTE_PERMISSIONS));

    const visible = new Set<string>();
    for (const [route, perm] of Object.entries(ROUTE_PERMISSIONS)) {
        if (perm === 'super_admin_only') continue;
        if (!user.permissions) continue;
        if (user.permissions[perm as keyof RolePermissions]) {
            visible.add(route);
        }
    }
    return visible;
}

// ── Parse user from localStorage ─────────────────────────────
export function parseStoredUser(raw: string | null): ARMSUser | null {
    if (!raw) return null;
    try {
        const u = JSON.parse(raw);
        return {
            userId: u.userId,
            userName: u.userName,
            name: u.name,
            userType: u.userType || 'admin',
            userRole: u.userRole || u.userType || 'admin',
            isSuperAdmin: u.isSuperAdmin === true,
            permissions: u.permissions,
        };
    } catch {
        return null;
    }
}

// ── License payload type ──────────────────────────────────────
export interface LicensePayload {
    licenseKey: string;
    clientName: string;
    expiryDate: string;
    features: string[];
    machineId: string;
    activatedAt: string;
    isValid: boolean;
    daysUntilExpiry: number;
}

// ── Parse stored license ──────────────────────────────────────
export function parseStoredLicense(raw: string | null): LicensePayload | null {
    if (!raw) return null;
    try {
        const l = JSON.parse(raw);
        const expiry = new Date(l.expiryDate);
        const now = new Date();
        const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
            ...l,
            isValid: daysUntilExpiry > 0,
            daysUntilExpiry,
        };
    } catch {
        return null;
    }
}

// ── Compute browser machine fingerprint ──────────────────────
export async function computeMachineFingerprint(): Promise<string> {
    if (typeof window === 'undefined') return 'server';
    const components = [
        navigator.userAgent,
        `${screen.width}x${screen.height}`,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.language,
        String(navigator.hardwareConcurrency || 0),
        String((navigator as any).deviceMemory || 0),
        screen.colorDepth,
        navigator.platform || '',
    ].join('|');

    // Use SubtleCrypto for SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(components);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
