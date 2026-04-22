'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getLocations } from '@/lib/supabase';
import { FiHome, FiMapPin, FiGrid, FiUsers, FiFileText, FiDollarSign, FiAlertTriangle, FiBarChart2, FiSettings, FiLogOut, FiChevronLeft, FiChevronRight, FiChevronDown, FiTrendingDown, FiCreditCard, FiPieChart, FiMessageSquare, FiDroplet, FiShield, FiClipboard, FiUserCheck, FiSend, FiZap } from 'react-icons/fi';

const menuGroups = [
    {
        label: '',
        name: 'main',
        collapsible: false,
        items: [
            { href: '/dashboard', label: 'Dashboard', icon: FiHome },
        ]
    },
    {
        label: 'Property',
        icon: FiMapPin,
        name: 'property',
        collapsible: true,
        items: [
            { href: '/dashboard/locations', label: 'Locations', icon: FiMapPin },
            { href: '/dashboard/units', label: 'Units', icon: FiGrid },
        ]
    },
    {
        label: 'Tenants & Billing',
        icon: FiUsers,
        name: 'tenants',
        collapsible: true,
        items: [
            { href: '/dashboard/tenants', label: 'Tenants', icon: FiUsers },
            { href: '/dashboard/billing', label: 'Billing', icon: FiFileText },
            { href: '/dashboard/payments', label: 'Payments', icon: FiDollarSign },
            { href: '/dashboard/unpaid', label: 'Unpaid Rent', icon: FiAlertTriangle },
            { href: '/dashboard/checklists', label: 'Checklists', icon: FiClipboard },
        ]
    },
    {
        label: 'Communication',
        icon: FiSend,
        name: 'comms',
        collapsible: true,
        items: [
            { href: '/dashboard/sms', label: 'Bulk SMS', icon: FiMessageSquare },
            { href: '/dashboard/demand-letters', label: 'Demand Letters', icon: FiFileText },
        ]
    },
    {
        label: 'Utilities',
        icon: FiDroplet,
        name: 'utilities',
        collapsible: true,
        items: [
            { href: '/dashboard/utilities', label: 'Water & Utility Billing', icon: FiDroplet },
            { href: '/dashboard/prepaid', label: 'Prepaid Tokens', icon: FiZap },
        ]
    },
    {
        label: 'Finance',
        icon: FiCreditCard,
        name: 'finance',
        collapsible: true,
        items: [
            { href: '/dashboard/expenses', label: 'Expense Master', icon: FiTrendingDown },
            { href: '/dashboard/reports', label: 'Reports & Analytics', icon: FiPieChart },
        ]
    },
    {
        label: 'Staff',
        icon: FiUserCheck,
        name: 'staff',
        collapsible: true,
        items: [
            { href: '/dashboard/caretakers', label: 'Caretakers', icon: FiUserCheck },
            { href: '/dashboard/petty-cash', label: 'Petty Cash', icon: FiDollarSign },
        ]
    },
    {
        label: 'System',
        icon: FiShield,
        name: 'system',
        collapsible: true,
        items: [
            { href: '/dashboard/users', label: 'Users & Access', icon: FiShield },
            { href: '/dashboard/settings', label: 'Settings', icon: FiSettings },
        ]
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
    const [user, setUser] = useState<any>(null);
    const [showLocDropdown, setShowLocDropdown] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        menuGroups.forEach(group => {
            if (!group.collapsible) return;
            const isGroupActive = group.items.some(item =>
                item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            );
            if (isGroupActive && !expandedGroups[group.name]) {
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

    useEffect(() => {
        const u = localStorage.getItem('arms_user');
        if (!u) { router.push('/'); return; }
        setUser(JSON.parse(u));
        getLocations().then(l => setLocations(l));
        const saved = localStorage.getItem('arms_location');
        if (saved) setSelectedLocation(parseInt(saved));
    }, [router]);

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

                {/* Logo */}
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5`}
                    style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {!collapsed && (
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                                <FiHome size={16} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-[16px] font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>ARMS<span className="text-blue-600">+</span></h2>
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
                        const isExpanded = expandedGroups[group.name];
                        const GroupIcon = group.icon;
                        const isGroupActive = group.items.some(item => isActive(item.href));

                        if (!group.label || !group.collapsible) {
                            return group.items.map(item => {
                                const ItemIcon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <button
                                        key={item.href}
                                        onClick={() => router.push(item.href)}
                                        title={collapsed ? item.label : undefined}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all mb-2
                                            ${active
                                                ? 'bg-blue-50 text-blue-700 font-semibold'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                            ${collapsed ? 'justify-center' : ''}
                                        `}
                                    >
                                        <ItemIcon size={18} className={active ? 'text-blue-600' : 'text-gray-400'} />
                                        {!collapsed && <span>{item.label}</span>}
                                        {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
                                    </button>
                                );
                            });
                        }

                        return (
                            <div key={group.name} className="mb-0.5">
                                <button
                                    onClick={() => toggleGroup(group.name)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                                        ${isGroupActive ? 'text-blue-700 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                        ${collapsed ? 'justify-center' : ''}
                                    `}
                                    title={collapsed ? group.label : undefined}
                                >
                                    {GroupIcon && <GroupIcon size={17} className={isGroupActive ? 'text-blue-600' : 'text-gray-400'} />}
                                    {!collapsed && (
                                        <>
                                            <span className="flex-1 text-left">{group.label}</span>
                                            <FiChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </>
                                    )}
                                </button>

                                <div className={`overflow-hidden transition-all duration-200 ease-in-out
                                    ${isExpanded && !collapsed ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="ml-[22px] pl-3 mt-0.5 space-y-0.5 border-l-2 border-gray-100">
                                        {group.items.map(item => {
                                            const ItemIcon = item.icon;
                                            const active = isActive(item.href);
                                            return (
                                                <button
                                                    key={item.href}
                                                    onClick={() => router.push(item.href)}
                                                    className={`w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] transition-all
                                                        ${active
                                                            ? 'text-blue-700 bg-blue-50 font-semibold border-l-2 border-blue-500 -ml-[3px] pl-[11px]'
                                                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}
                                                    `}
                                                >
                                                    <ItemIcon size={14} className={active ? 'text-blue-600' : 'text-gray-400'} />
                                                    <span>{item.label}</span>
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
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
                                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-semibold text-gray-800 truncate">{user?.name || 'Admin'}</p>
                                <p className="text-[10.5px] text-blue-600 capitalize font-medium">{user?.userType || 'admin'}</p>
                            </div>
                            <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Logout">
                                <FiLogOut size={15} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
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
                        <span className="text-[11px] text-gray-400 font-medium">ARMS v1.0</span>
                        <div className="w-px h-4 bg-gray-200" />
                        <LiveClock />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Location Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setShowLocDropdown(!showLocDropdown)}
                                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all"
                                style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#374151' }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'}
                            >
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
