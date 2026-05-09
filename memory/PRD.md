# Wholesale POS — Product Requirements

## Original Problem Statement
> "I want to build a pos software for my company"
>
> Clarified: Wholesale business POS with three role-specific interfaces (admin, in-house employee, on-site sales agent) and future website integration.

## User Personas
- **Admin** — owner / manager. Full access to everything.
- **In-house Employee** — desk-bound staff who process orders, manage inventory, customers, and invoices.
- **On-site Sales Agent** — mobile-first agent who takes orders at customer premises and tracks own commissions.

## Architecture
- Backend: FastAPI + Motor (MongoDB), JWT auth (Bearer in `Authorization` header), bcrypt password hashing.
- Frontend: React + react-router + Tailwind + shadcn/ui, axios with token interceptor.
- Theme: Light, deep rust accent (#9C462C), Cabinet Grotesk + Satoshi typography (Fontshare).
- All IDs are UUIDs (str). MongoDB queries exclude `_id`.

## Implemented (2026-05-08 / 2026-05-09)
### v1.0 — MVP
- JWT auth (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`) with 3 roles
- Seeded admin + sample employee + sample sales agent on startup
- Users management (admin only): CRUD + commission rate
- Products: CRUD with **tiered/bulk pricing**, stock + low-stock threshold
- Customers: CRUD with **payment terms**, **credit limit**, **customer-specific pricing**
- Orders: unified collection with `type ∈ {quote, order, invoice}`
  - Auto pricing (customer-specific → tier → base)
  - Stock decrement on order/invoice (not on quote)
  - **Quote → Order → Invoice** conversion (`/api/orders/{id}/convert?target=…`)
  - Sales agent commission auto-applied based on user's `commission_rate`
  - Sales agents only see their own orders
- Payments (admin/employee): cash / bank_transfer / cheque, partial payments, balance tracking
- Dashboard stats: revenue, outstanding, 7-day series, top products, agent leaderboard, low stock
- Agent stats: today + total revenue/commission, recent orders
- Pricing preview endpoint (`/api/pricing/preview`)

### v1.1 — Barcode Scanning (2026-05-09)
- Backend: `barcode` field on Product + index; `GET /api/products/by-barcode/{code}` (matches barcode OR sku, active only)
- Frontend: reusable `<BarcodeScanner />` modal (camera via `html5-qrcode` + manual/USB fallback)
- USB hardware scanner support via `useUsbScanner` global keypress hook (HID keyboard emulation)
- Integrated in: Products create/edit dialog; Admin "New Order"; Agent "New Order" (camera button + always-on USB capture)

## Frontend Routes
- `/login` — split-screen warehouse hero + sign-in
- `/admin` — dashboard (admin/employee)
- `/admin/orders`, `/admin/orders/new`, `/admin/orders/:id`
- `/admin/products`, `/admin/customers`
- `/admin/users`, `/admin/reports` (admin-only)
- `/agent` — mobile bottom-nav home (KPIs)
- `/agent/catalog`, `/agent/new-order`, `/agent/sales`

### v1.2 — PDF/Print Invoices, Public API, Email & Stock Automation (2026-05-09)
- **Printable invoices**: `/admin/orders/:id/print` route — clean print-friendly layout, browser "Print / Save as PDF" button. Print + Email buttons added on OrderDetail.
- **Email invoice (Resend)**: `POST /api/orders/{id}/email` sends a styled HTML invoice via Resend SDK. Async, non-blocking. Returns 503 if `RESEND_API_KEY` not set, 400 if customer has no email.
- **Public catalog API** (for company website): `GET /api/public/products` and `/api/public/products/{id}`, gated by `X-API-Key` header (or `?api_key=`). Returns sanitised product data (no internal stock/tier details, only `has_bulk_pricing` flag).
- **Stock automation**:
  - Out-of-stock guard on order/invoice creation and quote→order/invoice conversion (400 with detail listing shortages)
  - Auto-restore stock when order/invoice is deleted
  - Stock movements log (`stock_movements` collection): every change is recorded with reason, reference, qty_delta, stock_after, user
  - Manual stock adjustments: `POST /api/stock-movements` (admin/employee)
  - Low-stock email alerts to `ADMIN_ALERT_EMAIL` when stock crosses threshold (only on the transition, not every drop below)
- **Admin nav**: added "Stock Log" (admin/employee) and "Integration" (admin) entries.
- **Settings**: `GET /api/settings/integration` exposes Resend and Public API status to admin.
- **Env vars added**: `RESEND_API_KEY`, `SENDER_EMAIL`, `ADMIN_ALERT_EMAIL`, `PUBLIC_API_KEY`, `APP_URL`. All optional — features degrade gracefully.

## Backlog (Prioritised)
- **P1** Print-friendly invoice / PDF download
- **P1** Customer portal (their own quotes/invoices) — paves way for website integration
- **P1** Public read-only product catalog API for the company website to consume
- **P2** Generate barcodes/labels for products
- **P2** Email/WhatsApp share invoice links
- **P2** Inventory adjustments log + transfer-between-warehouses
- **P2** Stripe / Razorpay online invoice payments
- **P3** Multi-currency, taxes per jurisdiction, bilingual UI

## Test Credentials
See `/app/memory/test_credentials.md`.
