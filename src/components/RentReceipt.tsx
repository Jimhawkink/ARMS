'use client';
import { useRef } from 'react';
import { FiPrinter, FiShare2, FiX } from 'react-icons/fi';

interface ReceiptProps {
    payment: {
        payment_id?: number;
        tenant_name: string;
        phone: string;
        id_number?: string;
        unit_name: string;
        location_name: string;
        monthly_rent: number;
        amount: number;
        payment_method: string;
        mpesa_receipt?: string;
        payment_date: string;
        payment_month: string;
        balance_before: number;   // balance BEFORE this payment
        balance_after: number;    // balance AFTER this payment
        recorded_by?: string;
        notes?: string;
    };
    onClose: () => void;
}

export default function RentReceipt({ payment, onClose }: ReceiptProps) {
    const receiptRef = useRef<HTMLDivElement>(null);

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
    const now = new Date(payment.payment_date);
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const receiptNo = `ARMS-${String(payment.payment_id || Date.now()).slice(-6).padStart(6, '0')}`;
    const monthLabel = (() => { try { return new Date(payment.payment_month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return payment.payment_month || '-'; } })();

    // ===== FIFO Allocation Breakdown =====
    const totalDue = payment.balance_before;  // total outstanding before payment
    const rent = payment.monthly_rent;
    const arrears = Math.max(0, totalDue - rent);  // arrears from previous months
    const currentMonthDue = Math.min(rent, totalDue);  // current month portion of the debt
    const amountPaid = payment.amount;

    // How the payment was allocated (FIFO: arrears first)
    const arrearsPaid = Math.min(amountPaid, arrears);
    const remainAfterArrears = amountPaid - arrearsPaid;
    const currentRentPaid = Math.min(remainAfterArrears, currentMonthDue);
    const remainingBalance = payment.balance_after;

    const handlePrint = () => {
        const printContent = receiptRef.current?.innerHTML;
        if (!printContent) return;
        const w = window.open('', '_blank', 'width=320,height=700');
        if (!w) return;
        w.document.write(`<!DOCTYPE html><html><head><title>ARMS Receipt</title><style>
            @page { size: 80mm auto; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; width: 80mm; padding: 6mm; color: #111; }
            .r-center { text-align: center; }
            .r-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
            .r-row .lb { color: #666; }
            .r-row .vl { font-weight: 600; text-align: right; }
            .r-divider { border-top: 1px dashed #ccc; margin: 6px 0; }
            .r-thick { border-top: 2px dashed #333; margin: 8px 0; }
            .r-heading { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 1px; margin-bottom: 3px; border-bottom: 1px solid #eee; padding-bottom: 2px; }
            .r-box { padding: 6px; border-radius: 4px; margin: 6px 0; text-align: center; }
            .r-green { background: #f0fdf4; border: 1px solid #bbf7d0; }
            .r-red { background: #fef2f2; border: 1px solid #fecaca; }
            .r-blue { background: #eff6ff; border: 1px solid #bfdbfe; }
            .r-amt { font-size: 20px; font-weight: 900; }
            .r-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
            .r-stamp { display: inline-block; font-size: 14px; font-weight: 900; color: #16a34a; border: 2px solid #16a34a; padding: 2px 14px; border-radius: 4px; transform: rotate(-3deg); }
            .r-footer { text-align: center; font-size: 9px; color: #999; margin-top: 8px; }
            .r-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
        </style></head><body>${printContent}</body></html>`);
        w.document.close();
        setTimeout(() => { w.print(); }, 300);
    };

    const handleShare = async () => {
        const lines = [
            `🏠 *ARMS RENT RECEIPT*`,
            `━━━━━━━━━━━━━━━━━━`,
            `📄 Receipt: ${receiptNo}`,
            `📅 ${dateStr} ⏰ ${timeStr}`,
            ``,
            `👤 *TENANT*`,
            `Name: ${payment.tenant_name}`,
            `Phone: ${payment.phone}`,
            payment.id_number ? `ID: ${payment.id_number}` : '',
            `House: ${payment.unit_name}`,
            `Location: ${payment.location_name}`,
            ``,
            `💰 *PAYMENT BREAKDOWN*`,
            `For Month: ${monthLabel}`,
            `Monthly Rent: ${fmt(rent)}`,
            arrears > 0 ? `Previous Arrears: ${fmt(arrears)}` : '',
            arrears > 0 ? `Total Due: ${fmt(totalDue)}` : '',
            ``,
            `✅ *AMOUNT PAID: ${fmt(amountPaid)}*`,
            arrears > 0 ? `  → Arrears Cleared: ${fmt(arrearsPaid)}` : '',
            `  → Current Rent Paid: ${fmt(currentRentPaid)}`,
            ``,
            remainingBalance > 0 ? `⚠️ *BALANCE DUE: ${fmt(remainingBalance)}*` : `✅ *FULLY PAID - NO BALANCE*`,
            `━━━━━━━━━━━━━━━━━━`,
            `🏢 Alpha Rental Management System`,
            `📞 0720316175`,
            `Developed by Jimhawkins Korir`,
        ].filter(Boolean).join('\n');

        if (navigator.share) {
            try { await navigator.share({ title: `Rent Receipt - ${payment.tenant_name}`, text: lines }); } catch { }
        } else {
            const waUrl = `https://wa.me/${payment.phone?.replace(/^0/, '254')}?text=${encodeURIComponent(lines)}`;
            window.open(waUrl, '_blank');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: '380px', padding: 0 }} onClick={e => e.stopPropagation()}>
                {/* Action buttons */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100 no-print">
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition shadow-sm">
                            <FiPrinter size={14} /> Print 80mm
                        </button>
                        <button onClick={handleShare} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition shadow-sm">
                            <FiShare2 size={14} /> WhatsApp
                        </button>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition"><FiX size={16} /></button>
                </div>

                {/* Receipt Content — 80mm width with inline styles for correct print */}
                <div ref={receiptRef} style={{ width: '80mm', margin: '0 auto', padding: '6mm', fontFamily: "'Segoe UI', Tahoma, sans-serif", fontSize: '12px', background: '#fff' }}>

                    {/* Header */}
                    <div style={{ textAlign: 'center', borderBottom: '2px dashed #333', paddingBottom: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>🏠 ARMS</div>
                        <div style={{ fontSize: 10, color: '#555', margin: '2px 0' }}>Alpha Rental Management System</div>
                        <div style={{ fontSize: 9, color: '#888' }}>Rental Payment Receipt</div>
                    </div>

                    {/* Receipt number */}
                    <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, background: '#f5f5f5', padding: 4, borderRadius: 4, margin: '6px 0' }}>
                        {receiptNo}
                    </div>

                    {/* Date & Time */}
                    <div style={{ margin: '6px 0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: '#888', letterSpacing: 1, marginBottom: 3, borderBottom: '1px solid #eee', paddingBottom: 2 }}>📅 Date & Time</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
                            <span style={{ color: '#666' }}>Date:</span><span style={{ fontWeight: 600 }}>{dateStr}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
                            <span style={{ color: '#666' }}>Time:</span><span style={{ fontWeight: 600 }}>{timeStr}</span>
                        </div>
                    </div>

                    {/* Tenant Details */}
                    <div style={{ margin: '6px 0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: '#888', letterSpacing: 1, marginBottom: 3, borderBottom: '1px solid #eee', paddingBottom: 2 }}>👤 Tenant Details</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>Name:</span><span style={{ fontWeight: 600 }}>{payment.tenant_name}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>Phone:</span><span style={{ fontWeight: 600 }}>{payment.phone}</span></div>
                        {payment.id_number && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>ID No:</span><span style={{ fontWeight: 600 }}>{payment.id_number}</span></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>House:</span><span style={{ fontWeight: 600 }}>{payment.unit_name}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>Location:</span><span style={{ fontWeight: 600 }}>{payment.location_name}</span></div>
                    </div>

                    <div style={{ borderTop: '1px dashed #ccc', margin: '6px 0' }}></div>

                    {/* Rent & Charges Section */}
                    <div style={{ margin: '6px 0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: '#888', letterSpacing: 1, marginBottom: 3, borderBottom: '1px solid #eee', paddingBottom: 2 }}>📋 Charges</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>For Month:</span><span style={{ fontWeight: 700, color: '#4f46e5' }}>{monthLabel}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>Monthly Rent:</span><span style={{ fontWeight: 600 }}>{fmt(rent)}</span></div>
                        {arrears > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ Previous Arrears:</span><span style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(arrears)}</span></div>
                        )}
                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, fontWeight: 700 }}><span>Total Due:</span><span>{fmt(totalDue)}</span></div>
                    </div>

                    <div style={{ borderTop: '1px dashed #ccc', margin: '6px 0' }}></div>

                    {/* Payment Method */}
                    <div style={{ margin: '6px 0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: '#888', letterSpacing: 1, marginBottom: 3, borderBottom: '1px solid #eee', paddingBottom: 2 }}>💳 Payment Info</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
                            <span style={{ color: '#666' }}>Method:</span>
                            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: payment.payment_method === 'M-Pesa' ? '#d1fae5' : '#dbeafe', color: payment.payment_method === 'M-Pesa' ? '#059669' : '#1d4ed8' }}>
                                {payment.payment_method === 'M-Pesa' ? '📱' : '💵'} {payment.payment_method}
                            </span>
                        </div>
                        {payment.mpesa_receipt && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}><span style={{ color: '#666' }}>M-Pesa Ref:</span><span style={{ fontWeight: 600 }}>{payment.mpesa_receipt}</span></div>}
                    </div>

                    {/* Amount Paid */}
                    <div style={{ textAlign: 'center', margin: '8px 0', padding: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                        <div style={{ fontSize: 9, color: '#15803d', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Amount Paid</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>{fmt(amountPaid)}</div>
                    </div>

                    {/* Allocation Breakdown */}
                    {(arrears > 0 || currentRentPaid > 0) && (
                        <div style={{ margin: '6px 0', padding: 6, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, color: '#1d4ed8', letterSpacing: 1, marginBottom: 4, textAlign: 'center' }}>💡 Payment Allocation (FIFO)</div>
                            {arrears > 0 && arrearsPaid > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: 11 }}>
                                    <span style={{ color: '#666' }}>→ Arrears Cleared:</span><span style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(arrearsPaid)}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: 11 }}>
                                <span style={{ color: '#666' }}>→ Current Month Rent:</span><span style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(currentRentPaid)}</span>
                            </div>
                        </div>
                    )}

                    {/* Balance */}
                    <div style={{ textAlign: 'center', margin: '6px 0', padding: 6, borderRadius: 6, background: remainingBalance > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${remainingBalance > 0 ? '#fecaca' : '#bbf7d0'}` }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1, color: remainingBalance > 0 ? '#dc2626' : '#16a34a' }}>
                            {remainingBalance > 0 ? '⚠️ Balance Due' : '✅ No Balance Due'}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: remainingBalance > 0 ? '#dc2626' : '#16a34a' }}>
                            {fmt(remainingBalance)}
                        </div>
                    </div>

                    {/* PAID Stamp */}
                    <div style={{ textAlign: 'center', margin: '8px 0' }}>
                        <span style={{ display: 'inline-block', fontSize: 14, fontWeight: 900, color: '#16a34a', border: '2px solid #16a34a', padding: '2px 14px', borderRadius: 4, transform: 'rotate(-3deg)' }}>✓ PAID</span>
                    </div>

                    {/* Footer */}
                    <div style={{ textAlign: 'center', fontSize: 9, color: '#999', marginTop: 8, paddingTop: 8, borderTop: '2px dashed #333' }}>
                        <p style={{ margin: '2px 0' }}>Thank you for your payment!</p>
                        <p style={{ margin: '2px 0' }}>Alpha Rental Management System</p>
                        <p style={{ margin: '2px 0' }}>Developed by Jimhawkins Korir • 📞 0720316175</p>
                        <p style={{ margin: '2px 0', fontSize: 8 }}>Printed: {new Date().toLocaleString()}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
