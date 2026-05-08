'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FiSearch, FiX, FiChevronDown, FiAlertTriangle } from 'react-icons/fi';

/**
 * Tenant shape expected by this component.
 * Matches the arms_tenants row with joined arms_units and arms_locations.
 */
export interface TenantOption {
    tenant_id: number;
    tenant_name: string;
    phone: string | null;
    balance: number;
    is_on_vacation: boolean;
    monthly_rent: number;
    arms_units?: { unit_name: string } | null;
    arms_locations?: { location_name: string } | null;
}

interface SearchableTenantSelectorProps {
    tenants: TenantOption[];
    selectedTenantId: number | null;
    onSelect: (tenantId: number | null) => void;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * Pure filter function — exported so it can be property-tested independently.
 * Feature: ultra-rent-payment-modal
 * Requirements: 5.3
 */
export function filterTenants(tenants: TenantOption[], query: string): TenantOption[] {
    if (!query.trim()) return tenants;
    const q = query.toLowerCase();
    return tenants.filter(t =>
        t.tenant_name.toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q)
    );
}

/**
 * Build the display label for a tenant option.
 * Feature: ultra-rent-payment-modal
 * Requirements: 5.4
 */
export function buildTenantLabel(t: TenantOption): string {
    const unit = t.arms_units?.unit_name || '—';
    const loc = t.arms_locations?.location_name || '—';
    return `${t.tenant_name} — ${unit} · ${loc}`;
}

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

/**
 * SearchableTenantSelector
 *
 * A custom combobox that filters ALL active tenants by name or phone number.
 * Shows an arrears badge (red/amber pill) when the tenant has balance > 0.
 * Supports full keyboard navigation: ArrowDown/Up, Enter, Escape.
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */
export default function SearchableTenantSelector({
    tenants,
    selectedTenantId,
    onSelect,
    placeholder = 'Search tenant by name or phone…',
    disabled = false,
}: SearchableTenantSelectorProps) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedTenant = tenants.find(t => t.tenant_id === selectedTenantId) ?? null;
    const filtered = filterTenants(tenants, query);

    // Reset highlight when filtered list changes
    useEffect(() => { setHighlightIndex(0); }, [query]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Scroll highlighted item into view
    useEffect(() => {
        if (!listRef.current) return;
        const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [highlightIndex]);

    const selectTenant = useCallback((tenant: TenantOption) => {
        onSelect(tenant.tenant_id);
        setQuery('');
        setOpen(false);
    }, [onSelect]);

    const clearSelection = useCallback(() => {
        onSelect(null);
        setQuery('');
        setOpen(false);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [onSelect]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault(); }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filtered[highlightIndex]) selectTenant(filtered[highlightIndex]);
                break;
            case 'Escape':
                e.preventDefault();
                setOpen(false);
                break;
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Input */}
            <div
                className="flex items-center gap-2 w-full px-3 py-2.5 bg-white border rounded-xl transition-all cursor-text"
                style={{
                    borderColor: open ? '#6366f1' : '#e2e8f0',
                    boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : undefined,
                }}
                onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
            >
                <FiSearch size={15} className="text-gray-400 flex-shrink-0" />

                {selectedTenant && !open ? (
                    /* Show selected tenant chip when closed */
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                            {selectedTenant.tenant_name}
                        </span>
                        <span className="text-[11px] text-gray-400 truncate hidden sm:block">
                            {selectedTenant.arms_units?.unit_name || '—'} · {selectedTenant.arms_locations?.location_name || '—'}
                        </span>
                        {selectedTenant.balance > 0 && (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                <FiAlertTriangle size={9} /> {fmt(selectedTenant.balance)}
                            </span>
                        )}
                        {selectedTenant.is_on_vacation && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-700">🏖️ Vacation</span>
                        )}
                    </div>
                ) : (
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedTenant ? selectedTenant.tenant_name : placeholder}
                        disabled={disabled}
                        className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none min-w-0"
                        autoComplete="off"
                    />
                )}

                <div className="flex items-center gap-1 flex-shrink-0">
                    {selectedTenant && (
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); clearSelection(); }}
                            className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                            title="Clear selection"
                        >
                            <FiX size={13} />
                        </button>
                    )}
                    <FiChevronDown
                        size={14}
                        className="text-gray-400 transition-transform"
                        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                </div>
            </div>

            {/* Dropdown */}
            {open && (
                <div
                    className="absolute z-50 w-full mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
                    style={{ maxHeight: 320 }}
                >
                    {/* Search input inside dropdown when a tenant is already selected */}
                    {selectedTenant && (
                        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                                <FiSearch size={13} className="text-gray-400" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Search by name or phone…"
                                    className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
                                    autoFocus
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    {/* Count */}
                    <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
                        </span>
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold"
                            >
                                Clear search
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <ul
                        ref={listRef}
                        className="overflow-y-auto"
                        style={{ maxHeight: 240 }}
                        role="listbox"
                    >
                        {filtered.length === 0 ? (
                            <li className="px-4 py-6 text-center text-sm text-gray-400">
                                <span className="text-2xl block mb-1">🔍</span>
                                No tenants match "{query}"
                            </li>
                        ) : filtered.map((t, i) => {
                            const isSelected = t.tenant_id === selectedTenantId;
                            const isHighlighted = i === highlightIndex;
                            return (
                                <li
                                    key={t.tenant_id}
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseEnter={() => setHighlightIndex(i)}
                                    onClick={() => selectTenant(t)}
                                    className="px-4 py-3 cursor-pointer transition-colors flex items-center gap-3"
                                    style={{
                                        background: isSelected
                                            ? '#eef2ff'
                                            : isHighlighted
                                                ? '#f8fafc'
                                                : 'white',
                                        borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                                    }}
                                >
                                    {/* Avatar */}
                                    <div
                                        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0"
                                        style={{
                                            background: isSelected ? '#eef2ff' : '#f1f5f9',
                                            color: isSelected ? '#6366f1' : '#64748b',
                                        }}
                                    >
                                        {t.tenant_name.charAt(0).toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-gray-900 truncate">
                                                {t.tenant_name}
                                            </span>
                                            {t.is_on_vacation && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0">
                                                    🏖️ Vacation
                                                </span>
                                            )}
                                            {/* Arrears badge — shown iff balance > 0 (Property 5) */}
                                            {t.balance > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 flex-shrink-0">
                                                    <FiAlertTriangle size={9} />
                                                    {fmt(t.balance)} arrears
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                            {t.arms_units?.unit_name || '—'} · {t.arms_locations?.location_name || '—'}
                                            {t.phone ? ` · ${t.phone}` : ''}
                                        </p>
                                    </div>

                                    {isSelected && (
                                        <span className="text-indigo-500 flex-shrink-0 text-xs font-bold">✓</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
