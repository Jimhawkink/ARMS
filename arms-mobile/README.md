# ARMS Mobile App

Tenant-facing mobile app for the **Apartment Rental Management System (ARMS)**.

## Features
- 🔐 **Tenant Login** — Secure authentication via portal credentials
- 📊 **Ultra Dashboard** — View balance, bills, payments, and unit details
- 💳 **Pay Rent via M-Pesa STK Push** — Enter amount & phone number, get instant STK push
- 📋 **Billing History** — See all your rent bills and payment status
- 🧾 **Payment Receipts** — View recent payment confirmations

## Setup

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on Android device/emulator
npx expo start --android
```

## Build APK

```bash
# Install EAS CLI (one-time)
npm install -g eas-cli

# Login to Expo
eas login

# Build APK (preview/debug)
npm run build:apk

# Build release AAB
npm run build:release
```

## Tech Stack
- **Expo** + **React Native**
- **Expo Router** (file-based navigation)
- **Supabase** (same backend as ARMS web)
- **M-Pesa STK Push** (via ARMS API)
