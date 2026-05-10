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

### v1.3 — Edit Anywhere, Trade-ins, Customer Credit, Soft Delete (2026-05-09)
- **PATCH /api/orders/{id}**: edit any quote/order/invoice anytime — items, customer, notes, trade-ins, credit_applied. Fully recomputes totals, stock, balance_due, payment status, agent commission. Stock is automatically reconciled (old items restocked → new items checked + decremented).
- **Soft delete**: `DELETE /api/orders/{id}` now sets `deleted_at`. Stock and credit are auto-restored. `POST /api/orders/{id}/restore` brings it back (re-checks stock + re-applies credit). `DELETE /api/orders/{id}/purge` for permanent removal (admin, must be soft-deleted first).
- **Trade-in line items**: `trade_ins[]` on every order — description, qty, unit_value, optional `restock` flag (with `product_id`) to push the traded items back into inventory. Trade-in total auto-deducts from order total.
- **Customer credit balance**: `credit_balance` on Customer. `POST /api/customers/{id}/credit` to manually add/subtract; `GET /api/customers/{id}/credit-log` for history. On orders, `credit_applied` field auto-deducts from total and from `credit_balance`. On edit/delete/restore, balance is reconciled automatically.
- **Audit trail**: `order_audit` collection logs every create/edit/convert/delete/restore with timestamp + user. `GET /api/orders/{id}/audit` returns the timeline.
- **Orders list**: now has dual filters — type (All / Quotes / Orders / Invoices) **and** status (All / Active / Deleted / Paid / Unpaid). Deleted rows shown with strikethrough + "deleted" badge.
- **OrderDetail**: Edit, Delete, Restore buttons; trade-ins section, credit-applied row, audit timeline, deleted banner.
- **Pricing preview** (`POST /api/pricing/preview`) accepts `trade_ins` and `credit_applied`, returns `available_credit` so the form can show real-time totals.
- Customer page: new "Credit balance" column + per-row Wallet button to adjust credit.

### v1.4 — Customer Statement & Previous Dues (2026-05-09)
- **Customer Statement** — `GET /api/customers/{id}/statement` aggregates all open invoices, total outstanding, total invoiced, paid, available credit, recent payments, recent trade-ins, and aged buckets (0-30 / 31-60 / 61-90 / 90+ days).
- **Statement page** — `/admin/customers/:id/statement` with print-ready layout, "Print / Save as PDF" + "Email" buttons. Email goes through Resend with a styled HTML template.
- **Previous outstanding panel** on every invoice's OrderDetail page — shows the customer's other open invoices, total previous outstanding, grand total owed (this invoice + previous), and a link to the full statement.
- **Previous outstanding line** on the printable invoice PDF — appears in the totals block as "Previous outstanding (N)" + "Total amount due" so customers see the full picture on a single page.
- Customers list — added "Statement" (FileText) icon button per row to open the statement in a new tab.

### v1.5 — Agent-Editable Invoices (per-order unlock) (2026-05-09)
- New field `agent_can_edit` on every order (default `false`).
- `POST /api/orders/{id}/agent-edit?enabled=<bool>` — admin/employee toggles the lock. Audit trail records `agent_edit_unlocked` / `agent_edit_locked`.
- `PATCH /api/orders/{id}` permission widened: sales_agent can now edit their own order **only when** `agent_can_edit=true`. Otherwise returns 403 with a clear "ask admin to unlock" message.
- Admin/Employee OrderDetail: new "Agent edits" card with Switch (Locked / Unlocked) at the top of the page.
- Sales agent /agent/sales: each order shows a 🔒 **Locked** badge by default; when an admin unlocks an order, a ✏️ **Edit** button appears, opens `/agent/orders/:id/edit` (mobile-friendly form, full edit capabilities — items, qty, trade-ins, credit, notes). Top-of-list banner shows "N order(s) unlocked for editing".
- All existing edit-time guarantees (stock reconciliation, credit refund/re-apply, audit) apply identically when the agent saves.

### v1.6 — Product Variants (sizes / flavours) (2026-05-09)
- New `Variant` schema (id, label, sku, barcode, price, stock, low_stock_threshold, active). Each Product holds `variants: List[Variant] = []`.
- **Pricing rule** (per spec 2i):
  - Each variant has its own price.
  - Bulk tiers + customer-specific prices stay at the **parent product** level and apply uniformly across all variants.
- Order line items now carry `variant_id` + `variant_label`. Stock check / decrement / restock target the specific variant via `db.products.update_one({"id": pid, "variants.id": vid}, {"$inc": {"variants.$.stock": delta}})`.
- Out-of-stock errors include the variant label: e.g. "Premium Cola · 1 L (have 0, need 5)".
- `GET /api/products/by-barcode/{code}` now returns `{product, variant?}` — also matches variant SKUs and barcodes.
- Frontend
  - **Products dialog** — new "Variants (sizes / flavours)" section with grid editor (label, SKU, barcode, price, stock per variant). Free-text labels.
  - **Products list** — shows `from $X.XX` pricing and `N variants · M tiers` summary; total stock = sum of variants.
  - **Order form (admin + agent)** — when a product has variants, a second Select appears showing `Label · N left` per variant. Required before adding to cart.
  - **Barcode scan** auto-adds the correct variant when the scanned code matches a variant SKU/barcode.
  - **OrderDetail / OrderPrint** lines show `Product Name · Variant Label`.
  - Stock movements log uses "Product · Variant" naming for variant changes.
- **2026-02 hotfix**: `PATCH /api/orders/{id}` now passes `variant_id` when re-decrementing edited line items so variant stock reconciles correctly (was decrementing parent `product.stock`). Verified by `/app/backend/tests/test_variants.py` (14/14 passing). Added `data-testid="agent-line-product-{idx}"` and `agent-line-variant-{idx}` on `AgentNewOrder.jsx` for parity with admin OrderNew.

### v1.7 — Tax Jurisdictions & Product Images (2026-02)
- **Tax jurisdictions** (composite, tax-exclusive):
  - New collection `tax_jurisdictions` `{id, name, components: [{label, rate}], active}`. CRUD at `/api/tax-jurisdictions` (admin write, any auth read; DELETE soft-archives).
  - `customers.default_tax_jurisdiction_id` — picked by default on every order for that customer.
  - `orders.tax_jurisdiction_id`, `tax_jurisdiction_name`, `tax_components: [{label, rate, amount}]`, `tax` (sum). Override per order: omit field → use customer default; `""` → explicit no tax; specific id → override.
  - Compute: `taxable = max(subtotal − trade_in_total − credit_applied, 0)` → tax = taxable × Σrate%. Total = taxable + tax.
  - Each component appears as a separate line on OrderDetail, OrderPrint, and the agent preview.
- **Product images** (multiple, base64 in MongoDB):
  - `Product.images: [{id, data_url, filename, is_primary}]` with star-as-primary UI; client-side compression via `lib/imageUtils.compressToDataUrl` (max 800px, JPEG q=0.78).
  - Primary thumbnail in product list; `/api/public/products[/:id]` returns `primary_image` and `images[]`.
- 22/22 + 14/14 variants regression all pass.

### v1.8 — Catalog & Invoices-only (2026-02)
- **Catalog page** (`/admin/catalog` and `/agent/catalog`, all roles): visual product grid with primary image, search, filters (category / price min-max / in-stock), sort (name / price / newest), per-product variant select + qty + Add. Right-side cart sheet with line-level qty controls, customer + tax preview, and two checkout flows: inline create OR "Edit in form first" (URL-prefills `/{admin,agent}/orders/new?customer_id=…&items=[…]`).
- **Invoices-only**: removed all create-side UI for `quote` and `order` document types. Sidebar entry renamed to "Invoices". `OrderNew`, `AgentNewOrder`, and `Catalog` always create `type="invoice"`. `OrderDetail` no longer shows quote→order/invoice convert buttons. Orders list filters by `?type=invoice` and shows status tabs only (Active / Paid / Unpaid / Deleted / All). Backend untouched — historical quote/order documents remain in the DB for reference.
- **Bugfixes**:
  - `AgentNewOrder.jsx` now reads `customer_id` and `items` from URL params and prefills state (catalog `Edit in form first` flow on agent now works).
  - `Catalog.jsx` qty Input no longer mixes `value` + `defaultValue` (controlled-input warning gone).
- **Tests**: iteration 3 verified catalog flows; iteration 4 verified invoices-only refactor + both bugfixes; full backend regression (variants + taxes + product images) re-runs at 36/36 green.
- **Tax jurisdictions** (composite, tax-exclusive):
  - New collection `tax_jurisdictions` `{id, name, components: [{label, rate}], active}`. CRUD at `/api/tax-jurisdictions` (admin write, any auth read; DELETE soft-archives).
  - `customers.default_tax_jurisdiction_id` — picked by default on every order for that customer.
  - `orders.tax_jurisdiction_id`, `tax_jurisdiction_name`, `tax_components: [{label, rate, amount}]`, `tax` (sum). Override per order: omit field → use customer default; `""` → explicit no tax; specific id → override.
  - Compute: `taxable = max(subtotal − trade_in_total − credit_applied, 0)` → tax = taxable × Σrate%. Total = taxable + tax.
  - Each component appears as a separate line on OrderDetail, OrderPrint, and the agent preview (e.g. "CGST (9%) 18.00 / SGST (9%) 18.00").
  - Pricing preview returns `tax_components`, `tax`, `total` for live recompute in the order form.
  - Admin page at `/admin/tax` with grid editor for components and total-rate display.
- **Product images** (multiple, base64 in MongoDB):
  - `Product.images: [{id, data_url, filename, is_primary}]`. `is_primary` enforced (exactly one when present).
  - Upload UI in `/admin/products` dialog: file input → client-side compress via `lib/imageUtils.compressToDataUrl` (canvas, max 800px, JPEG q=0.78). Star icon to set primary, X to remove.
  - Products list shows the primary thumbnail in a new first column.
  - Public catalog `/api/public/products[/:id]` returns `primary_image` (data URL) and `images: [data_url, …]`.
- Tests: `/app/backend/tests/test_taxes.py` and `/app/backend/tests/test_product_images.py` cover CRUD, override semantics, composite math, trade-in/credit reduction of taxable base, image persistence and replacement. 22/22 + 14/14 variants regression all pass.

## Backlog (Prioritised)
- **P1** Customer portal (their own quotes/invoices) — paves way for website integration
- **P1** Wire company website to `/api/public/products` (set PUBLIC_API_KEY)
- **P2** Generate barcodes/labels for products
- **P2** Email/WhatsApp share invoice links
- **P2** Inventory adjustments log + transfer-between-warehouses
- **P2** Stripe / Razorpay online invoice payments
- **P2** Per-variant low-stock dashboard widget
- **P2** Server-side image size cap (defence-in-depth; client compression already in place)
- **P3** Multi-currency, bilingual UI
- **P3** Refactor `server.py` (~1900 lines) into modular routers

## Test Credentials
See `/app/memory/test_credentials.md`.
