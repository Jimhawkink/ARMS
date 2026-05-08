# Requirements Document

## Introduction

This document specifies the requirements for the **Ultra Rent Payment Modal** feature in the ARMS (Alpha Rental Management System) web application. The feature massively upgrades the existing "Record Rent Payment" modal on the payments page with vacation month awareness, comprehensive arrears display, searchable tenant selection, and working M-Pesa STK Push integration.

## Glossary

- **ARMS**: Alpha Rental Management System — the web application for managing rental properties
- **Payment_Modal**: The "Record Rent Payment" modal dialog on the payments page
- **Vacation_Month**: May, June, July, or August (months 05, 06, 07, 08) when university students are on vacation
- **Effective_Rent**: The actual rent amount due for a month — 50% of base rent for vacation months when tenant has is_on_vacation = true, otherwise full base rent
- **Arrears**: Unpaid or partially-paid rent from previous months (months before the current month)
- **Arrears_Breakdown**: A detailed table showing each unpaid/partially-paid month with month label, rent due, amount paid, balance remaining, and vacation indicator
- **Tenant_Selector**: The dropdown/combobox UI component for selecting a tenant
- **STK_Push**: Safaricom M-Pesa Lipa Na M-Pesa Online API that sends a payment prompt to a customer's phone
- **Payments_Page**: The page at AlphaPlusApp/arms/src/app/dashboard/payments/page.tsx
- **Supabase_Client**: The database client defined in AlphaPlusApp/arms/src/lib/supabase.ts
- **VACATION_MONTHS**: The constant array ['05', '06', '07', '08'] defined in supabase.ts
- **Active_Tenant**: A tenant with status = 'Active' in the arms_tenants table
- **Arrears_Badge**: A visual indicator (badge/pill) showing that a tenant has outstanding balance > 0

## Requirements

### Requirement 1: Vacation Month Awareness on Payments Page

**User Story:** As a property manager, I want the payments page to detect and display when the current month is a vacation month, so that I am aware of reduced rent expectations for students on vacation.

#### Acceptance Criteria

1. WHEN the current month is May, June, July, or August, THE Payments_Page SHALL display a vacation banner in the page header
2. THE vacation banner SHALL include a 🏖️ icon and text indicating "Vacation Month — Student rent is 50% for tenants on vacation"
3. THE vacation banner SHALL use a distinct visual style (e.g., amber/yellow background) to stand out from other page elements
4. WHEN the current month is not a vacation month, THE Payments_Page SHALL NOT display the vacation banner

### Requirement 2: Vacation Month Indicator in Payment Month Selector

**User Story:** As a property manager, I want to see which months are vacation months in the payment month selector, so that I can quickly identify when reduced rent applies.

#### Acceptance Criteria

1. THE Payment_Modal SHALL include a payment month selector (dropdown or date picker)
2. WHEN a month option is May, June, July, or August, THE month option SHALL display a 🏖️ icon next to the month label
3. THE vacation month indicator SHALL be visible in both the dropdown list and the selected value display
4. WHEN the selected tenant has is_on_vacation = true AND the selected month is a vacation month, THE Payment_Modal SHALL display the effective rent (50% of base rent) in the UI

### Requirement 3: Ultra Arrears Display in Payment Modal

**User Story:** As a property manager, I want to see a complete breakdown of a tenant's arrears when recording a payment, so that I can understand exactly which months are unpaid and allocate the payment correctly.

#### Acceptance Criteria

1. WHEN a tenant is selected in the Payment_Modal, THE Payment_Modal SHALL immediately fetch and display the tenant's arrears breakdown
2. THE arrears breakdown SHALL be displayed as a table with columns: Month, Rent Due, Amount Paid, Balance Remaining, Vacation Indicator
3. THE arrears breakdown SHALL include ALL unpaid and partially-paid months from the tenant's move-in date to the current month
4. THE arrears breakdown SHALL use the getAccumulatedArrearsForTenant function from Supabase_Client to fetch data
5. WHEN a month in the arrears breakdown is a vacation month AND the tenant has is_on_vacation = true, THE month row SHALL display a 🏖️ icon in the Vacation Indicator column
6. THE arrears breakdown table SHALL use color-coded rows: red/amber for arrears (past months), blue for current month
7. THE arrears breakdown table SHALL display a running total of all outstanding balances at the bottom
8. WHEN the tenant has no arrears (balance = 0), THE Payment_Modal SHALL display a success message "✓ No outstanding balance" instead of the arrears table

### Requirement 4: Selectable Arrears Months for Payment Allocation

**User Story:** As a property manager, I want to select which specific month(s) of arrears to pay in a transaction, so that I can allocate payments to specific billing periods as needed.

#### Acceptance Criteria

1. THE arrears breakdown table SHALL include a checkbox column for each unpaid/partially-paid month row
2. WHEN a user clicks a month row checkbox, THE Payment_Modal SHALL toggle the selection state for that month
3. THE Payment_Modal SHALL display a running total of selected months' balances below the arrears table
4. WHEN the user enters a payment amount, THE Payment_Modal SHALL show a preview of how the amount will be allocated across selected months
5. WHEN no months are selected, THE Payment_Modal SHALL use the default FIFO (First-In-First-Out) allocation logic from the existing recordPayment function
6. WHEN specific months are selected, THE Payment_Modal SHALL allocate the payment amount to ONLY the selected months in chronological order
7. THE allocation preview SHALL update in real-time as the user changes the payment amount or selected months

### Requirement 5: Searchable Tenant Selector with Full Tenant List

**User Story:** As a property manager, I want to search for tenants by name or phone number in a dropdown that shows ALL active tenants, so that I can quickly find and select the correct tenant.

#### Acceptance Criteria

1. THE Payment_Modal SHALL replace the existing plain select dropdown with a searchable combobox/autocomplete component
2. THE Tenant_Selector SHALL load and display ALL Active_Tenant records from the database
3. WHEN a user types in the Tenant_Selector, THE component SHALL filter tenants by matching the input against tenant name OR phone number
4. THE Tenant_Selector dropdown options SHALL display: tenant name, unit name, and location name for each tenant
5. WHEN a tenant has balance > 0, THE Tenant_Selector option SHALL display an Arrears_Badge next to the tenant name
6. THE Arrears_Badge SHALL show the outstanding balance amount in a red/amber pill/badge style
7. THE Tenant_Selector SHALL support keyboard navigation (arrow keys, enter to select, escape to close)
8. WHEN a user selects a tenant, THE Payment_Modal SHALL auto-populate the phone number field from the tenant record

### Requirement 6: Working M-Pesa STK Push Integration

**User Story:** As a property manager, I want to send an M-Pesa payment prompt directly to a tenant's phone from the payment modal, so that tenants can pay rent instantly via M-Pesa.

#### Acceptance Criteria

1. THE Payment_Modal SHALL include an "M-Pesa STK Push" button or tab option
2. WHEN the user clicks "M-Pesa STK Push", THE Payment_Modal SHALL call the /api/mpesa/stk-push endpoint (NOT /api/jenga/stk-push)
3. THE STK Push request SHALL include: phone number, payment amount, tenant ID, account reference, and transaction description
4. THE Payment_Modal SHALL auto-populate the phone number field from the selected tenant's phone number
5. WHEN the STK Push request is sent, THE Payment_Modal SHALL display a loading indicator with text "Sending payment prompt..."
6. WHEN the STK Push request succeeds, THE Payment_Modal SHALL display a success message "STK Push sent! Tenant will receive a payment prompt."
7. WHEN the STK Push request fails, THE Payment_Modal SHALL display an error message with the failure reason
8. THE Payment_Modal SHALL poll the STK Push status using GET /api/mpesa/stk-push?checkoutRequestId=... every 3 seconds after sending
9. THE Payment_Modal SHALL display real-time status updates: "Pending" → "Success" or "Failed"
10. WHEN the STK Push status changes to "Success", THE Payment_Modal SHALL auto-populate the M-Pesa receipt code field and enable the "Record Payment" button
11. WHEN the STK Push status changes to "Failed", THE Payment_Modal SHALL display an error message and allow the user to retry or enter payment manually

### Requirement 7: Premium Card Design for Payment Modal

**User Story:** As a property manager, I want the payment modal to have a modern, professional design with clear visual hierarchy, so that the interface is easy to use and visually appealing.

#### Acceptance Criteria

1. THE Payment_Modal SHALL use a card-based layout with rounded corners, shadows, and padding
2. THE arrears breakdown table SHALL use color-coded row backgrounds: light red/amber for arrears, light blue for current month, white for paid months
3. THE Payment_Modal SHALL use consistent spacing (padding, margins) following the existing Tailwind CSS design system
4. THE Payment_Modal SHALL use clear typography hierarchy: bold headings, medium body text, small labels
5. THE Payment_Modal SHALL include visual separators (borders, dividers) between major sections: tenant selection, arrears display, payment details, STK push
6. THE Payment_Modal SHALL use icon indicators (🏖️, ✓, ⏰, 📱, 💰) to enhance visual communication
7. THE Payment_Modal SHALL be responsive and work on mobile, tablet, and desktop screen sizes
8. THE Payment_Modal SHALL use smooth transitions and animations for state changes (loading, success, error)

### Requirement 8: Real-Time Payment Allocation Preview

**User Story:** As a property manager, I want to see a live preview of how a payment amount will be allocated across arrears and current rent, so that I can verify the allocation before recording the payment.

#### Acceptance Criteria

1. WHEN the user enters a payment amount in the Payment_Modal, THE Payment_Modal SHALL display a live allocation preview
2. THE allocation preview SHALL show: Arrears Paid, Current Rent Paid, Credit (if payment exceeds total due), and Balance After Payment
3. THE allocation preview SHALL update in real-time as the user changes the payment amount
4. THE allocation preview SHALL use the same FIFO logic as the recordPayment function in Supabase_Client
5. THE allocation preview SHALL display amounts in KES currency format with thousand separators (e.g., "KES 15,000")
6. WHEN the payment amount exceeds the total due, THE allocation preview SHALL show the credit amount in a green badge
7. WHEN the payment amount is less than the total due, THE allocation preview SHALL show the remaining balance in an amber badge
8. THE allocation preview SHALL be visually distinct (e.g., in a highlighted card or panel) to draw attention

### Requirement 9: Error Handling and Validation

**User Story:** As a property manager, I want clear error messages and validation in the payment modal, so that I can correct mistakes before recording a payment.

#### Acceptance Criteria

1. WHEN the user attempts to record a payment without selecting a tenant, THE Payment_Modal SHALL display an error message "Please select a tenant"
2. WHEN the user attempts to record a payment without entering an amount, THE Payment_Modal SHALL display an error message "Please enter a payment amount"
3. WHEN the user enters a payment amount ≤ 0, THE Payment_Modal SHALL display an error message "Payment amount must be greater than zero"
4. WHEN the user attempts to send an STK Push without a phone number, THE Payment_Modal SHALL display an error message "Phone number required for STK Push"
5. WHEN the STK Push API returns an error, THE Payment_Modal SHALL display the error message from the API response
6. WHEN the recordPayment API call fails, THE Payment_Modal SHALL display an error message and NOT close the modal
7. THE Payment_Modal SHALL use react-hot-toast for displaying error and success messages
8. THE error messages SHALL be displayed in red toast notifications with an error icon

### Requirement 10: Backward Compatibility with Existing Payment Flow

**User Story:** As a developer, I want the new payment modal to maintain backward compatibility with the existing payment recording logic, so that existing functionality is not broken.

#### Acceptance Criteria

1. THE Payment_Modal SHALL continue to use the recordPayment function from Supabase_Client for recording payments
2. THE recordPayment function SHALL continue to use FIFO allocation logic when no specific months are selected
3. THE Payment_Modal SHALL continue to support all existing payment methods: Cash, M-Pesa, Bank Transfer, Cheque
4. THE Payment_Modal SHALL continue to generate payment receipts using the existing RentReceipt component
5. THE Payment_Modal SHALL continue to update tenant balances and billing records using the existing database schema
6. THE Payment_Modal SHALL continue to support the existing payment notes format with meta tags: [Month:...], [ArrearsPaid:...], [CurrentRentPaid:...], [Credit:...]
7. WHEN a payment is recorded, THE Payments_Page SHALL refresh the payment list to show the new payment
8. THE Payment_Modal SHALL continue to support recording payments for callback transactions (M-Pesa C2B, Jenga callbacks)
