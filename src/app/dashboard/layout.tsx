'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getLocations } from '@/lib/supabase';
import { canAccessRoute, parseStoredUser, parseStoredLicense, computeMachineFingerprint, type ARMSUser, type LicensePayload } from '@/lib/rbac';
import toast from 'react-hot-toast';
import {
    FiHome, FiMapPin, FiGrid, FiUsers, FiFileText, FiDollarSign,
    FiAlertTriangle, FiBarChart2, FiSettings, FiLogOut, FiChevronLeft,
    FiChevronRight, FiChevronDown, FiTrendingDown, FiCreditCard,
    FiPieChart, FiMessageSquare, FiDroplet, FiShield, FiClipboard,
    FiUserCheck, FiSend, FiZap, FiKey, FiLock,
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
            { href: '/dashboard/unpaid', label: 'Unpaid Rent', icon: FiAlertTriangle, requiredPerm: 'can_view_reports' },
            { href: '/dashboard/checklists', label: 'Checklists', icon: FiClipboard, requiredPerm: 'can_manage_checklists' },
        ],
    },
    {
        label: 'Communication', icon: FiSend, name: 'comms', collapsible: true,
        items: [
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
    useEffect(() => {
        const tick = () => setTime(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
    return <span className="font-mono text-xs tabular-nums text-blue-600 font-bold">{time}</span>;
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
    const [user, setUser] = useState<ARMSUser | null>(null);
    const [license, setLicense] = useState<LicensePayload | null>(null);
    const [showLocDropdown, setShowLocDropdown] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [licenseChecked, setLicenseChecked] = useState(false);
    const licenseCheckDone = useRef(false); // prevent double-check on re-renders

    // ── RBAC + License guard ──────────────────────────────────
    useEffect(() => {
        const raw = localStorage.getItem('arms_user');
        if (!raw) { router.push('/'); return; }

        const parsedUser = parseStoredUser(raw);
        if (!parsedUser) { router.push('/'); return; }
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

    // Separate function (not useCallback) to avoid dependency issues
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
                router.push(`/license-activate?error=${encodeURIComponent(result.error || 'License invalid')}`);
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
        if (requiredPerm === null) return true;
        if (requiredPerm === 'super_admin_only') return false;
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
        <div className="flex min-h-screen" style={{ background: '#f0f2f5' }}>
            <style>{`
                .sidebar-scroll::-webkit-scrollbar { width: 4px; }
                .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .sidebar-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
                .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
            `}</style>

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
            <div className={`flex-1 flex flex-col transition-all duration-300 ${collapsed ? 'ml-[68px]' : 'ml-[252px]'}`}>
                {/* Topbar */}
                <header className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between"
                    style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e8edf5', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{greeting.emoji}</span>
                            <span className="text-sm font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{greeting.text}</span>
                        </div>
                        <div className="w-px h-4 bg-gray-200" />
                        <span className="text-[11px] text-gray-400 font-medium">ARMS v1.1</span>
                        {user?.isSuperAdmin && (
                            <>
                                <div className="w-px h-4 bg-gray-200" />
                                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">👑 SUPER ADMIN</span>
                            </>
                        )}
                        <div className="w-px h-4 bg-gray-200" />
                        <LiveClock />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Location Selector */}
                        <div className="relative">
                            <button onClick={() => setShowLocDropdown(!showLocDropdown)}
                                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all"
                                style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#374151' }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'}>
                                <FiMapPin size={13} className="text-blue-500" />
                                <span className="max-w-[120px] truncate text-[13px]">{selectedLocName}</span>
                                <FiChevronDown size={13} className={`text-gray-400 transition-transform ${showLocDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showLocDropdown && (
                                <div className="absolute right-0 top-full mt-1.5 w-56 rounded-2xl overflow-hidden z-50"
                                    style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
                                    <div className="px-3 py-2 border-b border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Location</p>
                                    </div>
                                    <button onClick={() => handleLocationChange(null)}
                                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${!selectedLocation ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                                        📍 All Locations
                                    </button>
                                    {locations.map(l => (
                                        <button key={l.location_id} onClick={() => handleLocationChange(l.location_id)}
                                            className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${selectedLocation === l.location_id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                                            🏢 {l.location_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-6 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
