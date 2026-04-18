'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getLocations } from '@/lib/supabase';
import { FiHome, FiMapPin, FiGrid, FiUsers, FiFileText, FiDollarSign, FiAlertTriangle, FiBarChart2, FiSettings, FiLogOut, FiChevronLeft, FiChevronRight, FiChevronDown, FiTrendingDown, FiCreditCard, FiPieChart } from 'react-icons/fi';

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
        label: 'System',
        icon: FiSettings,
        name: 'system',
        collapsible: true,
        items: [
            { href: '/dashboard/settings', label: 'Settings', icon: FiSettings },
        ]
    },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
    const [user, setUser] = useState<any>(null);
    const [showLocDropdown, setShowLocDropdown] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Auto-expand group containing current path
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

    const handleLogout = () => { localStorage.removeItem('arms_user'); localStorage.removeItem('arms_location'); router.push('/'); };

    const selectedLocName = locations.find(l => l.location_id === selectedLocation)?.location_name || 'All Locations';

    return (
        <div className="flex min-h-screen bg-[#f1f5f9]">
            {/* WHITE SIDEBAR with chevron toggle */}
            <aside className={`${collapsed ? 'w-[72px]' : 'w-[250px]'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out fixed top-0 left-0 h-full z-50 shadow-sm`}>
                {/* Logo + Collapse */}
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5 border-b border-gray-100`}>
                    {!collapsed && (
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                                <span className="text-white text-sm font-bold">A</span>
                            </div>
                            <div>
                                <h2 className="text-[16px] font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>ARMS</h2>
                                <p className="text-[9px] text-gray-400 font-medium">Rental Management</p>
                            </div>
                        </div>
                    )}
                    {collapsed && (
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                            <span className="text-white text-sm font-bold">A</span>
                        </div>
                    )}
                </div>

                {/* Chevron toggle button */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-[68px] w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md hover:border-indigo-300 transition-all z-50 text-gray-400 hover:text-indigo-600"
                >
                    {collapsed ? <FiChevronRight size={13} /> : <FiChevronLeft size={13} />}
                </button>

                {/* Navigation */}
                <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
                    {menuGroups.map((group) => {
                        const isExpanded = expandedGroups[group.name];
                        const GroupIcon = group.icon;
                        const isGroupActive = group.items.some(item => isActive(item.href));

                        // Non-collapsible (Dashboard)
                        if (!group.label || !group.collapsible) {
                            return group.items.map(item => {
                                const ItemIcon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <button
                                        key={item.href}
                                        onClick={() => router.push(item.href)}
                                        title={collapsed ? item.label : undefined}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all mb-1
                                            ${active ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                            ${collapsed ? 'justify-center' : ''}
                                        `}
                                    >
                                        <ItemIcon size={18} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                                        {!collapsed && <span>{item.label}</span>}
                                        {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                                    </button>
                                );
                            });
                        }

                        // Collapsible Group
                        return (
                            <div key={group.name} className="mb-0.5">
                                <button
                                    onClick={() => toggleGroup(group.name)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                                        ${isGroupActive ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                        ${collapsed ? 'justify-center' : ''}
                                    `}
                                    title={collapsed ? group.label : undefined}
                                >
                                    {GroupIcon && <GroupIcon size={17} className={isGroupActive ? 'text-indigo-600' : 'text-gray-400'} />}
                                    {!collapsed && (
                                        <>
                                            <span className="flex-1 text-left">{group.label}</span>
                                            <FiChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </>
                                    )}
                                </button>
                                {/* Sub Items */}
                                <div className={`overflow-hidden transition-all duration-200 ease-in-out
                                    ${isExpanded && !collapsed ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
                                `}>
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
                                                            ? 'text-indigo-700 bg-indigo-50 font-semibold border-l-2 border-indigo-500 -ml-[3px] pl-[11px]'
                                                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}
                                                    `}
                                                >
                                                    <ItemIcon size={14} className={active ? 'text-indigo-600' : 'text-gray-400'} />
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

                {/* User & Logout */}
                <div className="p-3 border-t border-gray-100">
                    {!collapsed ? (
                        <div className="flex items-center gap-2.5 px-2 py-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                                {user?.name?.charAt(0) || 'A'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</p>
                                <p className="text-[10px] text-gray-400 truncate">{user?.userType || 'admin'}</p>
                            </div>
                            <button onClick={handleLogout} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition" title="Logout">
                                <FiLogOut size={15} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleLogout} className="w-full flex items-center justify-center py-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition" title="Logout">
                            <FiLogOut size={18} />
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col transition-all duration-300 ${collapsed ? 'ml-[72px]' : 'ml-[250px]'}`}>
                {/* Sticky Top Bar */}
                <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-6 py-3.5 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-bold text-gray-800">
                            {(() => {
                                const now = new Date();
                                const hour = now.getHours();
                                if (hour < 12) return '☀️ Good Morning';
                                if (hour < 17) return '🌤️ Good Afternoon';
                                return '🌙 Good Evening';
                            })()}
                        </h1>
                        <span className="text-gray-300">|</span>
                        <span className="text-xs text-gray-400 font-medium">ARMS v1.0</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Location Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setShowLocDropdown(!showLocDropdown)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 transition"
                            >
                                <FiMapPin size={14} className="text-indigo-500" />
                                <span className="max-w-[140px] truncate">{selectedLocName}</span>
                                <FiChevronDown size={14} className={`text-gray-400 transition-transform ${showLocDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showLocDropdown && (
                                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
                                    <button onClick={() => handleLocationChange(null)} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition ${!selectedLocation ? 'text-indigo-700 font-semibold bg-indigo-50' : 'text-gray-600'}`}>📍 All Locations</button>
                                    {locations.map(l => (
                                        <button key={l.location_id} onClick={() => handleLocationChange(l.location_id)} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition ${selectedLocation === l.location_id ? 'text-indigo-700 font-semibold bg-indigo-50' : 'text-gray-600'}`}>
                                            🏢 {l.location_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
