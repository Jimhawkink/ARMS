// Note: metadata is exported from individual route layouts for per-page icons.
// The dashboard shell layout is a client component (uses hooks), so per-page
// metadata is handled by child layouts.
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getLocations } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { canAccessRoute, parseStoredUser, parseStoredLicense, computeMachineFingerprint, type ARMSUser, type LicensePayload } from '@/lib/rbac';
import toast from 'react-hot-toast';
import {
    FiHome, FiMapPin, FiGrid, FiUsers, FiFileText, FiDollarSign,
    FiAlertTriangle, FiBarChart2, FiSettings, FiLogOut, FiChevronLeft,
    FiChevronRight, FiChevronDown, FiTrendingDown, FiCreditCard,
    FiPieChart, FiMessageSquare, FiDroplet, FiShield, FiClipboard,
    FiUserCheck, FiSend, FiZap, FiKey, FiLock, FiSmartphone,
    FiClock, FiCheck,
} from 'react-icons/fi';

// ── Menu definition ───────────────────────────────────────────
// Each item has a requiredPerm — null means always visible
const menuGroups = [
    {
        label: '', name: 'main', collapsible: false,
        items: [{ href: '/dashboard', label: 'Dashboard', icon: FiHome, requiredPerm: null }],
    },
    {
        label: 'Property', icon: FiMapPin, name: 'property', collapsible: true,
        items: [
            { href: '/dashboard/locations', label: 'Locations', icon: FiMapPin, requiredPerm: 'can_manage_units' },
            { href: '/dashboard/units', label: 'Units', icon: FiGrid, requiredPerm: 'can_manage_units' },
        ],
    },
    {
        label: 'Tenants & Billing', icon: FiUsers, name: 'tenants', collapsible: true,
        items: [
            { href: '/dashboard/tenants', label: 'Tenants', icon: FiUsers, requiredPerm: 'can_manage_tenants' },
            { href: '/dashboard/billing', label: 'Billing', icon: FiFileText, requiredPerm: 'can_manage_billing' },
            { href: '/dashboard/payments', label: 'Payments', icon: FiDollarSign, requiredPerm: 'can_record_payments' },
            { href: '/dashboard/mpesa-transactions', label: 'M-Pesa Txns', icon: FiSmartphone, requiredPerm: 'can_record_payments' },
            { href: '/dashboard/unpaid', label: 'Unpaid Rent', icon: FiAlertTriangle, requiredPerm: 'can_view_reports' },
            { href: '/dashboard/checklists', label: 'Checklists', icon: FiClipboard, requiredPerm: 'can_manage_checklists' },
        ],
    },
    {
        label: 'Communication', icon: FiSend, name: 'comms', collapsible: true,
        items: [
            { href: '/dashboard/chats', label: 'Tenant Chat', icon: FiMessageSquare, requiredPerm: null },
            { href: '/dashboard/agreements', label: 'Agreements', icon: FiFileText, requiredPerm: 'can_manage_tenants' },
            { href: '/dashboard/sms', label: 'Messaging Hub', icon: FiMessageSquare, requiredPerm: 'can_send_sms' },
            { href: '/dashboard/demand-letters', label: 'Demand Letters', icon: FiFileText, requiredPerm: 'can_issue_demand_letters' },
        ],
    },
    {
        label: 'Utilities', icon: FiDroplet, name: 'utilities', collapsible: true,
        items: [
            { href: '/dashboard/utilities', label: 'Water & Utility Billing', icon: FiDroplet, requiredPerm: 'can_manage_utilities' },
            { href: '/dashboard/prepaid', label: 'Prepaid Tokens', icon: FiZap, requiredPerm: 'can_manage_utilities' },
        ],
    },
    {
        label: 'Finance', icon: FiCreditCard, name: 'finance', collapsible: true,
        items: [
            { href: '/dashboard/expenses', label: 'Expense Master', icon: FiTrendingDown, requiredPerm: 'can_manage_expenses' },
            { href: '/dashboard/reports', label: 'Reports & Analytics', icon: FiPieChart, requiredPerm: 'can_view_reports' },
            { href: '/dashboard/analytics', label: 'Super Analytics', icon: FiBarChart2, requiredPerm: 'can_view_reports' },
        ],
    },
    {
        label: 'Staff', icon: FiUserCheck, name: 'staff', collapsible: true,
        items: [
            { href: '/dashboard/caretakers', label: 'Caretakers', icon: FiUserCheck, requiredPerm: 'can_manage_caretakers' },
            { href: '/dashboard/petty-cash', label: 'Petty Cash', icon: FiDollarSign, requiredPerm: 'can_manage_expenses' },
        ],
    },
    {
        label: 'System', icon: FiShield, name: 'system', collapsible: true,
        items: [
            { href: '/dashboard/users', label: 'Users & Access', icon: FiShield, requiredPerm: 'can_manage_users' },
            { href: '/dashboard/settings', label: 'Settings', icon: FiSettings, requiredPerm: 'super_admin_only' },
            { href: '/dashboard/licensing', label: 'Licensing', icon: FiKey, requiredPerm: 'super_admin_only' },
        ],
    },
];

function LiveClock() {
    const [time, setTime] = useState('');
    const [date, setDate] = useState('');
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setTime(now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            setDate(now.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' }));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/90 text-slate-700 shadow-2xs hover:bg-slate-100 transition-all select-none">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-[11px] font-semibold text-slate-500 hidden xl:inline">{date}</span>
            <span className="font-mono text-xs font-black text-indigo-600 tracking-tight tabular-nums">{time}</span>
        </div>
    );
}

// ── Role badge ────────────────────────────────────────────────
function RoleBadge({ user }: { user: ARMSUser }) {
    if (user.isSuperAdmin) return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-gradient-to-r from-amber-400 to-orange-500 text-white">
            👑 SUPER ADMIN
        </span>
    );
    const colors: Record<string, string> = {
        admin: 'bg-indigo-100 text-indigo-700',
        manager: 'bg-blue-100 text-blue-700',
        caretaker: 'bg-green-100 text-green-700',
        viewer: 'bg-gray-100 text-gray-600',
        agent: 'bg-cyan-100 text-cyan-700',
        owner: 'bg-amber-100 text-amber-700',
    };
    const cls = colors[user.userRole] || colors.admin;
    return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold capitalize ${cls}`}>
            {user.userRole}
        </span>
    );
}

// ── Supabase client for real-time notifications ───────────────
const sbClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ChatNotification {
    chat_id: number;
    tenant_id: number;
    tenant_name: string;
    message: string;
    created_at: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
    const [user, setUser] = useState<ARMSUser | null>(null);
    const [license, setLicense] = useState<LicensePayload | null>(null);
    const [showLocDropdown, setShowLocDropdown] = useState(false);
    const locDropdownRef = useRef<HTMLDivElement>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (locDropdownRef.current && !locDropdownRef.current.contains(event.target as Node)) {
                setShowLocDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const [licenseChecked, setLicenseChecked] = useState(false);
    const licenseCheckDone = useRef(false);
    const [unreadChats, setUnreadChats] = useState(0);

    // ── Global notification overlay state ────────────────────
    const [notification, setNotification] = useState<ChatNotification | null>(null);
    const notifDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Poll unread chat count every 15s
    const fetchUnreadChats = useCallback(async () => {
        try {
            const res = await fetch('/api/chats');
            const data = await res.json();
            setUnreadChats(data.unread_count || 0);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchUnreadChats();
        const interval = setInterval(fetchUnreadChats, 15000);
        return () => clearInterval(interval);
    }, [fetchUnreadChats]);

    // Reset unread count when on chats page
    useEffect(() => {
        if (pathname?.startsWith('/dashboard/chats')) {
            setUnreadChats(0);
        }
    }, [pathname]);

    // ── GLOBAL real-time notification subscription ────────────
    // Fires on ANY dashboard page — blurs entire screen on new tenant message
    useEffect(() => {
        const channel = sbClient
            .channel('arms_global_chat_notifications')
            .on('postgres_changes' as any, {
                event: 'INSERT',
                schema: 'public',
                table: 'arms_chats',
            }, async (payload: any) => {
                const msg = payload.new;
                if (msg.sender !== 'tenant') return; // Only show for tenant messages

                // Bump unread count
                setUnreadChats(prev => prev + 1);

                // Don't show blur overlay if already viewing THIS tenant's thread
                const isViewingThread = pathname?.startsWith(`/dashboard/chats/${msg.tenant_id}`);
                if (isViewingThread) return;

                // Fetch tenant name for the notification
                let tenantName = `Tenant #${msg.tenant_id}`;
                try {
                    const res = await fetch(`/api/chats?tenantId=${msg.tenant_id}`);
                    const data = await res.json();
                    if (data.tenant?.tenant_name) tenantName = data.tenant.tenant_name;
                } catch { /* use default name */ }

                const notif: ChatNotification = {
                    chat_id: msg.chat_id,
                    tenant_id: msg.tenant_id,
                    tenant_name: tenantName,
                    message: msg.message,
                    created_at: msg.created_at,
                };

                setNotification(notif);

                // Auto-dismiss after 10 seconds
                if (notifDismissTimer.current) clearTimeout(notifDismissTimer.current);
                notifDismissTimer.current = setTimeout(() => setNotification(null), 10000);
            })
            .subscribe();

        return () => {
            sbClient.removeChannel(channel);
            if (notifDismissTimer.current) clearTimeout(notifDismissTimer.current);
        };
    }, [pathname]); // re-subscribe when pathname changes so isViewingThread is fresh

    // ── RBAC + License guard ──────────────────────────────────
    useEffect(() => {
        const raw = localStorage.getItem('arms_user');
        if (!raw) { router.push('/'); return; }

        const parsedUser = parseStoredUser(raw);
        if (!parsedUser) { router.push('/'); return; }

        // ── If non-super-admin has no permissions stored, reload from DB ──
        // This handles legacy sessions created before the permissions fix
        // Must use a nested async IIFE since useEffect callback cannot be async
        if (!parsedUser.isSuperAdmin && !parsedUser.permissions) {
            const refreshPerms = async () => {
                try {
                    const { getRolePermissions, getUserCustomPermissions } = await import('@/lib/supabase');
                    const rolePerms = await getRolePermissions();
                    const roleRow = rolePerms?.find((r: any) => r.role_name === parsedUser.userRole);
                    if (roleRow) {
                        const permKeys = [
                            'can_manage_tenants','can_manage_units','can_record_payments',
                            'can_view_reports','can_send_sms','can_manage_utilities',
                            'can_manage_caretakers','can_issue_demand_letters','can_manage_settings',
                            'can_manage_users','can_view_dashboard','can_manage_expenses',
                            'can_manage_billing','can_manage_checklists','is_super_admin',
                        ];
                        const permissions: Record<string, boolean> = {};
                        for (const k of permKeys) permissions[k] = roleRow[k] === true;
                        // Apply per-user custom overrides if any
                        try {
                            const custom = await getUserCustomPermissions(parsedUser.userId);
                            if (custom) Object.assign(permissions, custom);
                        } catch { /* ignore */ }
                        parsedUser.permissions = permissions as any;
                        // Persist updated user with permissions
                        const stored = JSON.parse(raw);
                        localStorage.setItem('arms_user', JSON.stringify({ ...stored, permissions }));
                    }
                } catch (e) {
                    console.warn('Could not refresh permissions:', e);
                }
                setUser({ ...parsedUser });
            };
            refreshPerms();
            return; // setUser will be called inside refreshPerms
        }
        setUser(parsedUser);

        // Check route access
        if (!canAccessRoute(parsedUser, pathname)) {
            toast.error('🔒 Access denied — insufficient permissions');
            router.push('/dashboard');
            return;
        }

        // Load license from storage
        const rawLicense = localStorage.getItem('arms_license');
        const parsedLicense = parseStoredLicense(rawLicense);
        setLicense(parsedLicense);

        // ── SUPER ADMIN: ALWAYS bypass license check ──────────
        // Super admin can NEVER be locked out by licensing
        if (parsedUser.isSuperAdmin) {
            setLicenseChecked(true);
            licenseCheckDone.current = true;
            getLocations().then(l => setLocations(l));
            const saved = localStorage.getItem('arms_location');
            if (saved) setSelectedLocation(parseInt(saved));
            return; // ← EXIT EARLY, no license validation at all
        }

        // Non-super-admin: validate license (only once per mount)
        if (!licenseCheckDone.current) {
            licenseCheckDone.current = true;
            doValidateLicense(parsedLicense);
        }

        getLocations().then(l => setLocations(l));
        const saved = localStorage.getItem('arms_location');
        if (saved) setSelectedLocation(parseInt(saved));
    }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    const doValidateLicense = async (lic: LicensePayload | null) => {
        try {
            if (!lic?.licenseKey) {
                router.push('/license-activate');
                return;
            }
            const machineId = await computeMachineFingerprint();
            const res = await fetch('/api/license/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: lic.licenseKey, machineId, isSuperAdmin: false }),
            });
            const result = await res.json();
            if (!result.valid) {
                localStorage.removeItem('arms_license');
                if (result.code === 'MACHINE_DRIFT') {
                    // Browser was updated — fingerprint changed. Guide user to re-activate.
                    toast.error('🔄 Browser update detected — please re-enter your license key to continue.', { duration: 6000 });
                    router.push(`/license-activate?error=${encodeURIComponent('Your browser was updated. Please re-enter your license key to re-activate — your license is still valid.')}`);
                } else {
                    router.push(`/license-activate?error=${encodeURIComponent(result.error || 'License invalid')}`);
                }
                return;
            }
            // Update license in storage with fresh server data
            const updatedLicense = {
                ...lic,
                clientName: result.clientName,
                expiryDate: result.expiryDate,
                features: result.features,
                daysUntilExpiry: result.daysUntilExpiry,
                isValid: true,
            };
            localStorage.setItem('arms_license', JSON.stringify(updatedLicense));
            setLicense(updatedLicense as LicensePayload);
        } catch {
            // Network error — allow access, don't lock out
        } finally {
            setLicenseChecked(true);
        }
    };


    // ── Auto-expand active group ──────────────────────────────
    useEffect(() => {
        menuGroups.forEach(group => {
            if (!group.collapsible) return;
            const isGroupActive = group.items.some(item =>
                item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            );
            if (isGroupActive) {
                setExpandedGroups(prev => ({ ...prev, [group.name]: true }));
            }
        });
    }, [pathname]);

    const toggleGroup = (groupName: string) => {
        if (collapsed) {
            setCollapsed(false);
            setExpandedGroups({ [groupName]: true });
        } else {
            setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
        }
    };

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname.startsWith(href);
    };

    // ── Check if a menu item is visible for this user ─────────
    const isItemVisible = (requiredPerm: string | null): boolean => {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        if (requiredPerm === null) return true;          // Always visible (e.g. Dashboard)
        if (requiredPerm === 'super_admin_only') return false;
        // If permissions not loaded yet (legacy session), show Dashboard only
        // by returning false for all permission-gated items
        if (!user.permissions) return false;
        return user.permissions[requiredPerm as keyof typeof user.permissions] === true;
    };

    const handleLocationChange = (locId: number | null) => {
        setSelectedLocation(locId);
        if (locId) localStorage.setItem('arms_location', String(locId));
        else localStorage.removeItem('arms_location');
        window.dispatchEvent(new CustomEvent('arms-location-change', { detail: locId }));
        setShowLocDropdown(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('arms_user');
        localStorage.removeItem('arms_location');
        router.push('/');
    };

    const selectedLocName = locations.find(l => l.location_id === selectedLocation)?.location_name || 'All Locations';
    const clientName = user?.isSuperAdmin ? 'Alpha Solutions' : (license?.clientName || null);
    const showExpiryWarning = !user?.isSuperAdmin && license?.daysUntilExpiry !== undefined && license.daysUntilExpiry <= 30 && license.daysUntilExpiry > 0;

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return { text: 'Good Morning', emoji: '☀️' };
        if (h < 17) return { text: 'Good Afternoon', emoji: '🌤️' };
        return { text: 'Good Evening', emoji: '🌙' };
    })();

    return (
        <div className="flex min-h-screen relative w-full max-w-full overflow-x-hidden" style={{ background: '#f0f2f5' }}>
            <style>{`
                .sidebar-scroll::-webkit-scrollbar { width: 4px; }
                .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .sidebar-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
                .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
            `}</style>

            {/* ════════════════════════════════════════════════════
                GLOBAL NOTIFICATION BLUR OVERLAY
                Appears on top of EVERYTHING on any dashboard page
                when a tenant sends a new message
            ════════════════════════════════════════════════════ */}
            {notification && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-[9999]"
                    style={{
                        backdropFilter: 'blur(18px)',
                        WebkitBackdropFilter: 'blur(18px)',
                        background: 'rgba(10,8,30,0.72)',
                        animation: 'fadeIn 0.25s ease',
                    }}
                    onClick={() => setNotification(null)}
                >
                    <style>{`
                        @keyframes fadeIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
                        @keyframes pulse-ring { 0%,100%{opacity:1} 50%{opacity:0.4} }
                    `}</style>
                    <div
                        className="mx-4 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
                        style={{
                            border: '1.5px solid rgba(167,139,250,0.5)',
                            background: 'linear-gradient(145deg,#1e1b4b,#2d1b69)',
                            animation: 'fadeIn 0.3s ease',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 flex items-center gap-3"
                            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed,#a855f7)' }}>
                            {/* Animated ring */}
                            <div className="relative flex-shrink-0">
                                <div className="absolute inset-0 rounded-full opacity-60 animate-ping"
                                    style={{ background: 'rgba(167,139,250,0.5)', animationDuration: '1.2s' }} />
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg relative z-10"
                                    style={{ background: 'rgba(255,255,255,0.2)' }}>
                                    {notification.tenant_name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-extrabold text-sm truncate">{notification.tenant_name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"
                                        style={{ animation: 'pulse-ring 1s ease infinite' }} />
                                    <span className="text-green-300 text-xs font-bold">New message just now</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setNotification(null)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 transition hover:bg-white/20"
                                style={{ background: 'rgba(255,255,255,0.15)', fontSize: 18 }}>
                                ×
                            </button>
                        </div>

                        {/* Message body */}
                        <div className="px-5 py-5">
                            <p className="text-xs font-extrabold uppercase tracking-widest mb-3" style={{ color: '#a5b4fc' }}>
                                📨 Message Received
                            </p>
                            <div className="rounded-2xl px-4 py-3.5 mb-5"
                                style={{
                                    background: 'rgba(99,102,241,0.18)',
                                    border: '1px solid rgba(167,139,250,0.3)',
                                }}>
                                <p className="text-white text-sm leading-relaxed" style={{ wordBreak: 'break-word' }}>
                                    {notification.message.length > 200
                                        ? notification.message.slice(0, 200) + '…'
                                        : notification.message}
                                </p>
                                <p className="text-xs mt-2 text-right" style={{ color: '#818cf8' }}>
                                    {new Date(notification.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>

                            {/* Auto dismiss bar */}
                            <div className="mb-4 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.2)' }}>
                                <div className="h-full rounded-full"
                                    style={{
                                        background: 'linear-gradient(90deg,#6366f1,#a855f7)',
                                        animation: 'shrink 10s linear forwards',
                                    }} />
                                <style>{`@keyframes shrink { from { width:100%; } to { width:0%; } }`}</style>
                            </div>

                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => {
                                        setNotification(null);
                                        router.push(`/dashboard/chats/${notification.tenant_id}`);
                                    }}
                                    className="flex-1 py-3 rounded-2xl text-sm font-extrabold text-white transition active:scale-95"
                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.45)' }}>
                                    💬 Reply Now
                                </button>
                                <button
                                    onClick={() => {
                                        setNotification(null);
                                        router.push('/dashboard/chats');
                                    }}
                                    className="px-4 py-3 rounded-2xl text-sm font-bold transition"
                                    style={{
                                        background: 'rgba(99,102,241,0.2)',
                                        color: '#c4b5fd',
                                        border: '1px solid rgba(167,139,250,0.35)',
                                    }}>
                                    Inbox
                                </button>
                                <button
                                    onClick={() => setNotification(null)}
                                    className="px-4 py-3 rounded-2xl text-sm font-bold transition"
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#94a3b8',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}>
                                    Later
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── SIDEBAR ─── */}
            <aside className={`${collapsed ? 'w-[68px]' : 'w-[252px]'} flex flex-col transition-all duration-300 ease-in-out fixed top-0 left-0 h-full z-50`}
                style={{ background: '#ffffff', borderRight: '1px solid #e2e8f0' }}>

                {/* Logo + Licensed To */}
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-4`}
                    style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {!collapsed && (
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                                <FiHome size={16} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-[16px] font-bold text-gray-900 tracking-tight leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    ARMS<span className="text-blue-600">+</span>
                                </h2>
                                {clientName ? (
                                    <p className="text-[9px] text-gray-400 font-medium truncate leading-tight" title={`Licensed to: ${clientName}`}>
                                        Licensed to: <span className="text-blue-600 font-semibold">{clientName}</span>
                                    </p>
                                ) : !user?.isSuperAdmin ? (
                                    <p className="text-[9px] text-amber-500 font-bold leading-tight">⚠️ Unlicensed</p>
                                ) : null}
                            </div>
                        </div>
                    )}
                    {collapsed && (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                            <FiHome size={16} />
                        </div>
                    )}
                </div>

                {/* Expiry warning banner */}
                {showExpiryWarning && !collapsed && (
                    <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[10px] font-bold text-amber-700">
                            ⚠️ License expires in {license?.daysUntilExpiry} day{license?.daysUntilExpiry !== 1 ? 's' : ''}
                        </p>
                    </div>
                )}

                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-[68px] w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all z-50"
                    style={{ background: '#fff', border: '1.5px solid #e2e8f0', color: '#64748b' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; }}
                >
                    {collapsed ? <FiChevronRight size={12} /> : <FiChevronLeft size={12} />}
                </button>

                {/* Nav */}
                <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto overflow-x-hidden sidebar-scroll" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {menuGroups.map((group) => {
                        // Filter items by permission
                        const visibleItems = group.items.filter(item => isItemVisible(item.requiredPerm));
                        if (visibleItems.length === 0) return null;

                        const isExpanded = expandedGroups[group.name];
                        const GroupIcon = group.icon;
                        const isGroupActive = visibleItems.some(item => isActive(item.href));

                        if (!group.label || !group.collapsible) {
                            return visibleItems.map(item => {
                                const ItemIcon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <button key={item.href} onClick={() => router.push(item.href)}
                                        title={collapsed ? item.label : undefined}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all mb-2
                                            ${active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                            ${collapsed ? 'justify-center' : ''}`}>
                                        <ItemIcon size={18} className={active ? 'text-blue-600' : 'text-gray-400'} />
                                        {!collapsed && <span>{item.label}</span>}
                                        {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
                                    </button>
                                );
                            });
                        }

                        return (
                            <div key={group.name} className="mb-0.5">
                                <button onClick={() => toggleGroup(group.name)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                                        ${isGroupActive ? 'text-blue-700 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                        ${collapsed ? 'justify-center' : ''}`}
                                    title={collapsed ? group.label : undefined}>
                                    {GroupIcon && <GroupIcon size={17} className={isGroupActive ? 'text-blue-600' : 'text-gray-400'} />}
                                    {!collapsed && (
                                        <>
                                            <span className="flex-1 text-left">{group.label}</span>
                                            <FiChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </>
                                    )}
                                </button>
                                <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded && !collapsed ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="ml-[22px] pl-3 mt-0.5 space-y-0.5 border-l-2 border-gray-100">
                                        {visibleItems.map(item => {
                                            const ItemIcon = item.icon;
                                            const active = isActive(item.href);
                                            const isSuperAdminItem = item.requiredPerm === 'super_admin_only';
                                            return (
                                                <button key={item.href} onClick={() => router.push(item.href)}
                                                    className={`w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] transition-all
                                                        ${active ? 'text-blue-700 bg-blue-50 font-semibold border-l-2 border-blue-500 -ml-[3px] pl-[11px]' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                                                    <ItemIcon size={14} className={active ? 'text-blue-600' : 'text-gray-400'} />
                                                    <span>{item.label}</span>
                                                    {isSuperAdminItem && <FiLock size={10} className="ml-auto text-amber-400" title="Super Admin only" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </nav>

                {/* User footer */}
                <div className={`border-t border-gray-100 ${collapsed ? 'p-2' : 'p-3'}`}>
                    {!collapsed ? (
                        <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-default">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0"
                                style={{ background: user?.isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                                {user?.isSuperAdmin ? '👑' : (user?.name?.charAt(0)?.toUpperCase() || 'A')}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-semibold text-gray-800 truncate">{user?.name || 'Admin'}</p>
                                {user && <RoleBadge user={user} />}
                            </div>
                            <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Logout">
                                <FiLogOut size={15} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ background: user?.isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                                {user?.isSuperAdmin ? '👑' : (user?.name?.charAt(0)?.toUpperCase() || 'A')}
                            </div>
                            <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Logout">
                                <FiLogOut size={15} />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* ─── MAIN ─── */}
            <div className={`flex-1 min-w-0 max-w-full flex flex-col transition-all duration-300 ${collapsed ? 'ml-[68px]' : 'ml-[252px]'}`}>
                {/* ════════════════════════════════════════════════════
                    SUPER ROBUST ULTRA-MODERN COMMAND TOPBAR
                ════════════════════════════════════════════════════ */}
                <header className="sticky top-0 z-40 px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl shadow-[0_2px_14px_-4px_rgba(15,23,42,0.06)]">
                    {/* Left: Greeting, User, Status Pill, Live Clock */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {/* Dynamic Ambient Greeting Pill */}
                        <div className="flex items-center gap-2 bg-slate-50/90 border border-slate-200/90 px-3 py-1.5 rounded-2xl shadow-2xs">
                            <span className="text-base select-none">{greeting.emoji}</span>
                            <span className="text-xs sm:text-[13px] font-black text-slate-800 tracking-tight font-sans">
                                {greeting.text}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
                            </span>
                        </div>

                        {/* Live Cloud Status */}
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-wider">LIVE CLOUD</span>
                        </div>

                        {/* Role Badge */}
                        {user?.isSuperAdmin ? (
                            <span className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-2xl text-[10px] font-black uppercase tracking-wider text-white shadow-xs bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 shadow-amber-500/25">
                                👑 SUPER ADMIN
                            </span>
                        ) : user ? (
                            <span className="hidden md:inline-block">
                                <RoleBadge user={user} />
                            </span>
                        ) : null}

                        {/* Digital Live Clock */}
                        <div className="hidden lg:block">
                            <LiveClock />
                        </div>
                    </div>

                    {/* Right: Quick Shortcuts, Location Selector, Tenant Messaging, User Pill */}
                    <div className="flex items-center gap-2 sm:gap-2.5">
                        {/* Quick Navigation: Log Payment */}
                        <button
                            onClick={() => router.push('/dashboard/payments')}
                            className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 transition-all shadow-2xs"
                        >
                            <FiDollarSign size={13} className="text-emerald-600" />
                            <span>Log Payment</span>
                        </button>

                        {/* Quick Navigation: Tenants */}
                        <button
                            onClick={() => router.push('/dashboard/tenants')}
                            className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 transition-all shadow-2xs"
                        >
                            <FiUsers size={13} className="text-indigo-600" />
                            <span>Tenants</span>
                        </button>

                        {/* Location Selector (Ultra Sleek Glass Pill) */}
                        <div className="relative" ref={locDropdownRef}>
                            <button
                                onClick={() => setShowLocDropdown(!showLocDropdown)}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-bold transition-all border shadow-2xs ${
                                    showLocDropdown || selectedLocation
                                        ? 'bg-indigo-50/90 border-indigo-300 text-indigo-900 ring-2 ring-indigo-100'
                                        : 'bg-slate-50 border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70'
                                }`}
                            >
                                <div className="w-5 h-5 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 text-[10px]">
                                    <FiMapPin size={11} />
                                </div>
                                <span className="max-w-[110px] sm:max-w-[140px] truncate text-xs sm:text-[13px] font-black">
                                    {selectedLocName}
                                </span>
                                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-md text-[9px] font-black bg-slate-200/70 text-slate-600">
                                    {selectedLocation ? 'Filtered' : `${locations.length} Estates`}
                                </span>
                                <FiChevronDown
                                    size={13}
                                    className={`text-slate-400 transition-transform duration-200 ${showLocDropdown ? 'rotate-180 text-indigo-600' : ''}`}
                                />
                            </button>

                            {showLocDropdown && (
                                <div
                                    className="absolute right-0 top-full mt-2 w-64 rounded-3xl overflow-hidden z-50 bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-2xl animate-fadeIn font-sans"
                                >
                                    <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                            Active Property Scope
                                        </p>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            {locations.length} configured
                                        </span>
                                    </div>

                                    <div className="max-h-[280px] overflow-y-auto p-1.5 space-y-1">
                                        <button
                                            onClick={() => handleLocationChange(null)}
                                            className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between ${
                                                !selectedLocation
                                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                                    : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>📍</span>
                                                <span>All Locations (Global)</span>
                                            </div>
                                            {!selectedLocation && <FiCheck size={14} className="text-white" />}
                                        </button>

                                        {locations.map(l => {
                                            const isSel = selectedLocation === l.location_id;
                                            return (
                                                <button
                                                    key={l.location_id}
                                                    onClick={() => handleLocationChange(l.location_id)}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between ${
                                                        isSel
                                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                                            : 'text-slate-700 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span>🏢</span>
                                                        <span className="truncate">{l.location_name}</span>
                                                    </div>
                                                    {isSel && <FiCheck size={14} className="text-white flex-shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tenant Messages Hub Button with Floating Badge */}
                        <button
                            onClick={() => router.push('/dashboard/chats')}
                            className={`relative p-2.5 rounded-2xl border transition-all duration-200 shadow-2xs hover:scale-105 ${
                                unreadChats > 0
                                    ? 'bg-rose-50 border-rose-200 text-rose-600 shadow-rose-200/40'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50'
                            }`}
                            title="Tenant Messages & Chat Hub"
                        >
                            <FiMessageSquare size={17} />
                            {unreadChats > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center bg-rose-500 shadow-sm animate-bounce">
                                    {unreadChats > 9 ? '9+' : unreadChats}
                                </span>
                            )}
                        </button>

                        {/* User Profile Avatar & Logout */}
                        <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200">
                            <div
                                className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-xs font-black shadow-sm flex-shrink-0 select-none"
                                style={{
                                    background: user?.isSuperAdmin
                                        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                        : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                }}
                                title={user?.name || 'Admin'}
                            >
                                {user?.isSuperAdmin ? '👑' : (user?.name?.charAt(0)?.toUpperCase() || 'A')}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition border border-transparent hover:border-rose-200"
                                title="Log Out"
                            >
                                <FiLogOut size={15} />
                            </button>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 min-w-0 max-w-full p-4 sm:p-6 overflow-y-auto overflow-x-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
}
