'use client';
import { useState, useEffect } from 'react';
import { getSettings, supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiSave, FiSettings, FiPhone, FiMail, FiSmartphone, FiMessageCircle, FiGlobe, FiDollarSign, FiAlertTriangle, FiUser, FiHome } from 'react-icons/fi';

const settingGroups = [
    {
        title: 'Company Information',
        icon: FiHome,
        color: '#6366f1',
        fields: [
            { key: 'company_name', label: 'Company Name', placeholder: 'Alpha Rental Management System', type: 'text', icon: '🏢' },
            { key: 'company_phone', label: 'Company Phone', placeholder: '0720316175', type: 'text', icon: '📞' },
            { key: 'company_email', label: 'Company Email', placeholder: 'info@arms.com', type: 'email', icon: '📧' },
            { key: 'company_address', label: 'Company Address', placeholder: 'P.O Box 123, Nairobi', type: 'text', icon: '📍' },
            { key: 'company_logo_url', label: 'Logo URL', placeholder: 'https://example.com/logo.png', type: 'text', icon: '🖼️' },
        ]
    },
    {
        title: 'M-Pesa Configuration',
        icon: FiSmartphone,
        color: '#10b981',
        fields: [
            { key: 'mpesa_shortcode', label: 'Paybill / Till Number', placeholder: '9830453', type: 'text', icon: '📱' },
            { key: 'mpesa_consumer_key', label: 'Consumer Key', placeholder: 'Daraja API Key', type: 'password', icon: '🔑' },
            { key: 'mpesa_consumer_secret', label: 'Consumer Secret', placeholder: 'Daraja API Secret', type: 'password', icon: '🔐' },
            { key: 'mpesa_passkey', label: 'Passkey', placeholder: 'Lipa Na M-Pesa Passkey', type: 'password', icon: '🗝️' },
            { key: 'mpesa_callback_url', label: 'Callback URL', placeholder: 'https://your-domain.com/api/mpesa/callback', type: 'text', icon: '🔗' },
        ]
    },
    {
        title: 'SMS Configuration',
        icon: FiMessageCircle,
        color: '#f59e0b',
        fields: [
            { key: 'sms_enabled', label: 'Enable SMS Notifications', placeholder: 'true / false', type: 'text', icon: '💬' },
            { key: 'sms_provider', label: 'SMS Provider', placeholder: 'AfricasTalking / Twilio', type: 'text', icon: '🏷️' },
            { key: 'sms_api_key', label: 'SMS API Key', placeholder: 'API Key', type: 'password', icon: '🔑' },
            { key: 'sms_sender_id', label: 'Sender ID', placeholder: 'ARMS', type: 'text', icon: '📤' },
            { key: 'sms_username', label: 'SMS Username', placeholder: 'Username', type: 'text', icon: '👤' },
        ]
    },
    {
        title: 'WhatsApp Configuration',
        icon: FiPhone,
        color: '#22c55e',
        fields: [
            { key: 'whatsapp_enabled', label: 'Enable WhatsApp Messaging', placeholder: 'true / false', type: 'text', icon: '🟢' },
            { key: 'whatsapp_api_url', label: 'WhatsApp API URL', placeholder: 'https://api.whatsapp.com/...', type: 'text', icon: '🔗' },
            { key: 'whatsapp_api_key', label: 'WhatsApp API Key', placeholder: 'API Key', type: 'password', icon: '🔑' },
            { key: 'whatsapp_phone_number', label: 'WhatsApp Business Number', placeholder: '254720316175', type: 'text', icon: '📱' },
        ]
    },
    {
        title: 'Billing & Rent Settings',
        icon: FiDollarSign,
        color: '#8b5cf6',
        fields: [
            { key: 'currency', label: 'Currency', placeholder: 'KES', type: 'text', icon: '💰' },
            { key: 'billing_day', label: 'Billing Day of Month', placeholder: '1', type: 'number', icon: '📅' },
            { key: 'due_day', label: 'Due Day of Month', placeholder: '5', type: 'number', icon: '⏰' },
            { key: 'late_fee_enabled', label: 'Enable Late Fees', placeholder: 'true / false', type: 'text', icon: '⚠️' },
            { key: 'late_fee_amount', label: 'Late Fee Amount (KES)', placeholder: '500', type: 'number', icon: '💸' },
            { key: 'late_fee_percent', label: 'Late Fee Percentage (%)', placeholder: '5', type: 'number', icon: '📊' },
        ]
    },
    {
        title: 'Notification Settings',
        icon: FiAlertTriangle,
        color: '#ef4444',
        fields: [
            { key: 'reminder_days_before', label: 'Reminder Days Before Due', placeholder: '3', type: 'number', icon: '🔔' },
            { key: 'overdue_notification', label: 'Send Overdue Notifications', placeholder: 'true / false', type: 'text', icon: '📢' },
            { key: 'receipt_auto_send', label: 'Auto-Send Receipt After Payment', placeholder: 'true / false', type: 'text', icon: '🧾' },
        ]
    },
];

export default function SettingsPage() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const s = await getSettings();
            const map: Record<string, string> = {};
            s.forEach((item: any) => { map[item.setting_key] = item.setting_value || ''; });
            setSettings(map);
        } catch { toast.error('Failed to load settings'); }
        setLoading(false);
    };

    const handleChange = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Upsert each setting
            for (const [key, value] of Object.entries(settings)) {
                await supabase.from('arms_settings')
                    .upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' });
            }
            toast.success('Settings saved successfully!');
        } catch (err: any) { toast.error(err.message || 'Failed to save'); }
        setSaving(false);
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title flex items-center gap-2">⚙️ Settings</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage system configuration, integrations, and preferences</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                    {saving ? <div className="spinner" style={{ width: 16, height: 16 }}></div> : <FiSave size={16} />}
                    Save All Settings
                </button>
            </div>

            {settingGroups.map((group, gi) => {
                const GroupIcon = group.icon;
                return (
                    <div key={gi} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Group Header */}
                        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3" style={{ borderLeftWidth: 4, borderLeftColor: group.color }}>
                            <div className="p-2.5 rounded-xl" style={{ background: `${group.color}10` }}>
                                <GroupIcon size={18} style={{ color: group.color }} />
                            </div>
                            <h2 className="text-base font-bold text-gray-900">{group.title}</h2>
                        </div>

                        {/* Fields */}
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {group.fields.map(field => (
                                    <div key={field.key} className={field.key === 'company_name' || field.key === 'company_address' || field.key === 'mpesa_callback_url' || field.key === 'whatsapp_api_url' ? 'md:col-span-2' : ''}>
                                        <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5 block">
                                            <span>{field.icon}</span> {field.label}
                                        </label>
                                        <input
                                            type={field.type}
                                            value={settings[field.key] || ''}
                                            onChange={e => handleChange(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="input-field"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Developer Info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                <div className="px-6 py-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                        <span className="text-white font-bold">💎</span>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">Alpha Rental Management System (ARMS) v1.0</p>
                        <p className="text-xs text-gray-400 mt-0.5">Developed by <span className="text-indigo-600 font-semibold">Jimhawkins Korir</span> • Alpha Solutions • 📞 0720316175</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
