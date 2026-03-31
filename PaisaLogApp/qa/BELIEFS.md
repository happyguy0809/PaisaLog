# PaisaLog — Core Project Beliefs & Feature Tracker
# This file is the source of truth for how we build.
# Last updated: 2026-03-26

## Core Beliefs

### Belief 1 — Minimalistic UI always
- Buttons and inputs that are not needed should not exist
- With financial data already overwhelming, every screen must have one clear purpose
- If a feature needs more than one new screen, question whether it can be simpler
- No feature gets added just because it is technically possible

### Belief 2 — Backend in Rust, Frontend in React Native
- API server, business logic, DB queries — Rust only
- All app UI and user interaction — React Native (TypeScript) only
- Android platform bridge (SMS, camera, notifications) — minimal Java/Kotlin, never touched again
- No mixing of concerns

### Belief 3 — snake_case everywhere, always
- All API request and response fields — snake_case
- All TypeScript interfaces — snake_case
- All DB columns — snake_case
- All Rust struct fields — snake_case
- No exceptions. No camelCase in API layer.

### Belief 4 — Every feature ships with tests
- No feature is considered DONE until:
  1. Happy path automated test added to qa/run_tests.py
  2. Negative and edge cases added to qa/test_cases.csv with type=automated where possible
  3. python3 qa/run_tests.py passes with 0 failures before moving to next feature
- Manual-only tests are acceptable only when hardware or UI interaction is required
- Test IDs follow area prefix: H=Home S=Spend A=Auth SM=SMS C=Category AD=Add AC=Account

### Belief 5 — Privacy is non-negotiable
- All user financial data is end-to-end encrypted
- Data lives on the user's device first — server is never the source of truth
- Server only ever sees encrypted blobs — never raw transaction data, amounts, or merchant names
- Encryption keys are derived from the user's credentials and never leave their device
- No analytics, no tracking, no selling of financial data — ever
- SMS bodies never leave the phone — only parsed fields (amount, merchant, date) are sent to server
- Bill photos stored locally only — server used only as encrypted transit for family sharing, deleted immediately after delivery
- Login sessions are device-bound — a new device requires re-authentication
- Export is always available — users own their data and can download it anytime
- When in doubt, store less not more

### Belief 6 — Fix bugs before features
- Any confirmed bug blocks new feature work
- A bug is confirmed when: reproducible on device OR failing automated test
- Bugs get a fix_log.csv entry when resolved

---


---
## Belief 7 — Service configuration over hardcoded values
- Currency codes, timezone lists, locale options, plan limits, compression levels — all live in a single config source
- Never hardcode these values in UI components or API handlers
- Frontend: a `config/` directory with typed constants exported from one place
- Backend: a `config.rs` or equivalent that is the single source of truth
- If a value needs to change (e.g. adding a new currency), it changes in exactly one file
- No magic strings scattered across screens

## Belief 8 — Money is always stored in the smallest currency unit
- All amounts stored in the database as integers in the smallest unit (paise for INR, cents for USD, fils for AED etc.)
- A central `money.ts` (frontend) and `money.rs` (backend) module handles all conversion
- This module knows: currency code → smallest unit name, divisor, decimal places, symbol, display format
- Examples: INR paise (divisor 100, 2 decimals), JPY yen (divisor 1, 0 decimals), KWD fils (divisor 1000, 3 decimals)
- `fmt_money(paise, currency)` always produces the correct display string
- `to_smallest_unit(amount_str, currency)` always produces the correct integer for storage
- No floating point arithmetic on money — ever
- The `home_currency` on the user record drives all display formatting
- Foreign currency transactions store: `amount_smallest_unit` (in home currency), `original_amount`, `original_currency`, `fx_rate_at_entry`


### Belief 8 — Migration note: renaming paise columns
Once the money framework is live and all currency handling goes through `money.ts`:
- `amount_paise` → `amount` (stores smallest unit of home currency, not always paise)
- `debit_paise`, `credit_paise`, `refund_paise` → `debit_amount`, `credit_amount`, `refund_amount`
- This is a **breaking migration** — do not do this until:
  1. `money.ts` module is live and all `fmt()` calls are replaced with `fmt_money()`
  2. All API consumers are updated to expect `amount` not `amount_paise`
  3. A proper DB migration with backward compatibility window is written
  4. All QA tests are updated
- Until then, `amount_paise` stays as-is — the name is wrong for non-INR users but it works

### Belief 9 — Timestamp model: UTC + frozen tz_offset per record

Every transaction (and any future event record) stores exactly three time-related fields:

| Field | Type | Purpose |
|-------|------|---------|
| `created_at` | `TIMESTAMPTZ` (UTC) | Server-side creation time. Used for all DB sorting, querying, aggregation. Never displayed raw. |
| `txn_date` | `DATE` | The local date of the transaction as the user experienced it. e.g. "I bought coffee on March 24". Never changes. |
| `tz_offset` | `TEXT` | The UTC offset at the moment of creation, e.g. `+05:30`. Captured from the user's device timezone at entry time. **Frozen forever — never updated.** |

**Display rule:** `local_time = created_at converted using tz_offset`

**Why tz_offset is frozen:**
- If a user enters a transaction in India (+05:30) then moves to Dubai (+04:00), the old transaction correctly shows IST time because that is when it happened
- No backfilling is ever needed when a user changes their phone timezone
- New transactions capture the new timezone automatically

**Implementation rules:**
- All `created_at` columns are `TIMESTAMPTZ` — PostgreSQL stores UTC internally
- `tz_offset` is captured client-side at transaction creation from the device timezone
- All date display in the app goes through `format_date_with_offset(created_at, tz_offset, fmt)` from `utils/date.ts`
- Never call `dayjs().format()` directly in components — always use the utility
- The user's current timezone setting (Account → Settings) is only used for NEW transactions, not for re-displaying old ones
- For logs and audit queries: always filter by UTC range on `created_at`
- For user-facing "when did this happen": always use `tz_offset` from the record itself

**What NOT to store:**
- No `local_created_at` column — it is derived and storing it creates sync risk
- No duplicate timestamp fields — UTC + tz_offset is sufficient for all use cases


## Belief 10 — Navigation structure: Self / Family / Tools / Account

### Tab structure (4 tabs, no floating Add)
| Tab | Icon | Purpose |
|-----|------|---------|
| Self | person | Personal finance dashboard — mirrors Family tab structure |
| Family | group | Household view — same structure as Self but multi-member |
| Tools | wrench | Refund tracker, hidden vault, deleted txns, targets, settings |
| Account | gear | Profile, logout, backup, consent |

### Add transaction
- Add button lives inside the Self tab (top-right header), not a dedicated tab
- Accessible from transaction list via FAB or header button
- Same Add screen as today

### Self tab structure (mirrors Family exactly)
- 4 chrome-style sub-tabs: Overall / Income / Expenses / Investments
- Overall: summary cards (income, expenses, investments, savings) + target progress bars + category contribution bars
- Income: total + breakdown by source
- Expenses: total + member contribution bar (just self) + by category + by merchant
- Investments: total + by platform
- Date filter (same as Family: This month / Last month / Custom)
- Tap any category/merchant → GroupTxnTray → tap txn → TxnDetailScreen

### Key principle: one mental model
- Self tab and Family tab are the same screen with different data scope
- Self = Family with member_filter set to current user only
- This means features built for Family (tray, contribution bars, targets) work for Self automatically
- No separate "Spend" screen — it is replaced by Self tab Expenses sub-tab

### Migration plan
1. Finish current QA fixes (REF, DEL, SET tests)
2. Build SelfScreen mirroring FamilyScreen architecture
3. Update TabNavigator: Home→Self, Spend→removed, Family stays, Account stays, add Tools tab
4. Move refund tracker / hidden vault / deleted txns / targets from AccountScreen into ToolsScreen
5. AccountScreen becomes lean: profile, backup, logout, consent only
6. Update BELIEFS.md feature status when done


---
## Open Architecture Decisions
*These decisions need to be made before building the features that depend on them.*

### Decision 1 — End-to-end encryption
**Question:** Should sensitive fields (merchant, amount, note) be encrypted at rest so the server never sees raw data?

**Options:**
- ❌ **No E2E encryption (current)** — Data stored in plaintext on server. Fast to build, easy to add features like insights and search. User trusts PaisaLog with their data.
- ✅ **E2E encryption** — Keys derived from user credentials, never leave device. Server stores encrypted blobs. Maximum privacy but: no server-side search, no insights without client-side computation, family sharing requires key exchange protocol, much harder to build.
- 🔄 **Hybrid** — Encrypt at rest for privacy, but user can consent to share anonymised/aggregated data for insights. Most complex.

**Current stance:** Not implementing E2E encryption for MVP. Revisit at 1,000 users or when a privacy-first positioning is decided.

**Blockers before deciding:** Does PaisaLog want to offer AI-powered insights as a feature? If yes, E2E encryption makes that impossible unless computed on-device.

---

### Decision 2 — Local-first vs server-first storage
**Question:** Should transactions be stored primarily on the device (SQLite) with server as backup, or on the server with local cache?

**Options:**
- ✅ **Server-first (current)** — All data on server, app is a thin client. Works today. Easy sync, easy family sharing. Requires internet for most operations.
- 🔄 **Local-first (SQLite on device)** — Data lives in SQLite on device. Server stores encrypted backup. Works offline. Complex sync, conflict resolution needed. Family sharing requires server relay anyway.
- 🔄 **Hybrid** — Server is source of truth, SQLite is a read cache for offline display. Write operations require connectivity.

**Current stance:** Server-first for MVP. If offline support becomes a user request, add SQLite as a read cache (hybrid) — not full local-first.

**Blockers before deciding:** How important is offline mode to target users? Indian market has good connectivity — offline may not be a priority.

---

### Decision 3 — Database partitioning
**Question:** Should the transactions table be partitioned by quarter, or use a single table with indexes?

**Options:**
- ✅ **Single table + indexes (recommended)** — One table, no maintenance, same query speed with proper indexes. Simpler, zero operational risk. Partitioning adds no benefit until 50M+ rows.
- 🔄 **Partitioned + pg_partman** — Auto-create future partitions, no manual maintenance. Still adds complexity.
- ❌ **Partitioned + manual** — Current state. Risk of missed partition creation causing production outage.

**Current stance:** Migrate to single table. Not done yet — needs careful migration script. Do before first production deployment.

**Migration steps when ready:**
1. Create `transactions_new` as plain table with all columns + indexes
2. Copy all data: `INSERT INTO transactions_new SELECT * FROM transactions`
3. Rename: `ALTER TABLE transactions RENAME TO transactions_partitioned_backup`
4. Rename: `ALTER TABLE transactions_new RENAME TO transactions`
5. Update sequences, foreign keys, RLS policies
6. Verify row counts match
7. Drop backup after 30 days

---
## Feature Status

### ✅ DONE
| Feature | Notes |
|---------|-------|
| Magic link auth (email → JWT) | Full flow working end to end |
| Home screen with summary + recent transactions | API connected, snake_case fixed |
| Spend screen with category breakdown | Categories grouped from real data |
| Add transaction manually (+ Add button) | Saves and refreshes Home |
| Account screen with logout | Clears tokens, returns to onboarding |
| SMS bridge (Java BroadcastReceiver) | Built, permissions granted via adb |
| SMS parser (OTP filter, amount extract) | 8/8 automated tests passing |
| Deep link handling (magic link opens app) | Handles both paisalog:// and https:// |
| snake_case convention enforced everywhere | API, DB, TypeScript all consistent |
| JWT expiry extended to 7d for dev | .env JWT_ACCESS_EXPIRY_SECS=604800 |
| QA test runner (run_tests.py) | 31/33 automated tests passing |

### 🔄 IN PROGRESS / BUGS TO FIX
| ID | Issue | Priority |
|----|-------|----------|
| BUG-01 | Cash transactions not appearing in expenses | HIGH |
| BUG-02 | Investment transactions (Zerodha) going to expense not investments | HIGH |
| BUG-03 | No delete transaction option | HIGH |
| BUG-04 | TxnDetailScreen not tested end to end | MEDIUM |

### 📋 P1 — Next to build
| Feature | Description |
|---------|-------------|
| Currency/timezone config module | Single `config/` source for all currency metadata (symbol, divisor, decimals) and timezone list |
| Money formatting module | `money.ts` + backend equivalent — `fmt_money(amount, currency)`, `to_smallest_unit(str, currency)` |
| UTC + timezone consistency | All dates through `format_date(utc, tz, fmt)` utility, timezone stored per-event in DB |
| Investment toggle on Add | User can mark any transaction as investment |
| Bill scan on Add screen | Tap 📷 on Add screen → camera/gallery → parse bill image for amount + merchant + date → pre-fill form → user confirms → saves transaction with photo attached |
| Transaction photo/bill | Camera → compress (low/med/high) → save per transaction |
| Delete transaction | Swipe or button to delete or mark as wrong |

### 📋 P2 — Soon
| Feature | Description |
|---------|-------------|
| Budget alerts | Per category + total, notify at 50%/80%/100% (customizable) |
| Budget setup UI | Graph-first input, not overwhelming form |
| Refund tracker UI | Track RRN/ARN, see if refund processed (backend API already built) |

### 📋 P3 — Planned
| Feature | Description |
|---------|-------------|
| Family/household view | See total family spend together, per-member breakdown with permissions |
| Hidden transactions | Hide from family or total, separate PIN, optional reveal timer |
| Credit card optimizer | Input amount + merchant + category → see best card benefits |

### 📋 P4 — Future
| Feature | Description |
|---------|-------------|
| Transaction visibility timer | Reveal after set date (anniversary/gift feature) |
| Next.js PWA for iOS | Web app for iOS users without App Store |
| Bank partnerships | Promote credit cards via optimizer feature (monetization) |
| Multiple household memberships | A user can be a member of multiple households simultaneously (e.g. partner household + parents household). Each household is independent. User sees all households they belong to in Family tab, can switch between them. Monetization: Free = no household, Pro = 1 household, Family+ = multiple households. Role can differ per household (admin in one, member in another). Transactions linked to household by household_id — a transaction can only belong to one household at a time, but user can choose which household to assign it to. |
| Leave household | Member can leave any household they are in. Admin can remove other members. If admin leaves, ownership transfers to longest-standing member. Leaving does not delete transactions — they become personal (household_id set to null). |
| Multi-currency support | Users set home currency in Account settings. Transactions in foreign currency show paid currency + approximate home currency equivalent (using live rate at time of entry + approximate bank conversion markup shown with asterisk *). All storage in paise of home currency with original currency and rate stored separately. |
| SMS + Email transaction mapping | When both SMS and email exist for same transaction, map them using transaction ID, amount, date, and merchant. Bank ref numbers from SMS matched against email confirmation IDs. Prevents duplicate entries. Merged record shows both sources. |
| Deleted transactions restore | Deleted transactions soft-deleted (deleted_at timestamp, not hard delete). Separate view to see deleted transactions. Restore option available. Hard delete only after 30 days. |
| DB integrity audit | Audit all tables for: partition keys correctly mapped, created_by/deleted_at/updated_at columns present and populated, foreign keys consistent, RLS policies covering all tables. Run as automated check. |
| End-to-end encryption | All sensitive fields (merchant, amount, note, location) encrypted at rest using user-derived keys. Server only stores encrypted blobs. Family sharing uses ephemeral key exchange — only required fields shared, not full transaction objects. Google Drive backup stores encrypted export only. |
| Google Drive backup | Full encrypted backup of user transactions to Google Drive on demand and scheduled (weekly). Restore from backup in app. Family members only get their own data + shared household data in backup. |
| ML category pattern matching | Server-side cluster/pattern matching on merchant names to auto-assign categories. Improves over time as more transactions are added. Categories shown as both bubble selects AND searchable text input in AddScreen and filters. |
| LLM-powered data analysis | User can ask natural language questions about their data (e.g. "how much did I spend on food last 3 months"). LLM generates SQL query, runs against user's own data only (never other users), returns result as chart or table. Export filtered data as CSV for external analysis. Family members can query household data if permissions allow. |
| Corporate expense tracker | B2B monetization — companies pay per seat. Employees track reimbursable expenses, download reports. Employers verify. See full spec below. |

---

## Tech Stack
- Backend: Rust + axum, PostgreSQL (partitioned), Redis, systemd on Ubuntu VM
- Frontend: React Native 0.76 bare workflow, MMKV, React Query, React Navigation
- Infrastructure: Lenovo ThinkCentre M920q VM, ngrok tunnel (dev), Cloudflare tunnel pending
- DB: PostgreSQL 5432 (main) + 5433 (analytics) via Docker

## API
- Dev URL: https://curtis-squirmiest-uncuriously.ngrok-free.app
- Production: https://api.paisalog.in (not yet live)
- Auth: Bearer token, stored in MMKV as tok_access / tok_refresh
- Convention: snake_case throughout, no exceptions

---

## Corporate Expense Tracker — Full Feature Spec
*(Planned monetization feature — B2B SaaS on top of PaisaLog)*

### Problem it solves
Employees paying out-of-pocket for work expenses (travel, meals, supplies) struggle to:
- Track which transactions are reimbursable
- Generate clean reports for finance teams
- Attach bills and location proof
- Separate personal vs corporate spend

### How it works

#### For employees
- Dual account mode: personal + corporate accounts run simultaneously
- Move transactions between personal ↔ corporate at any time
- Two ways to mark corporate transactions:
  1. Auto-detect: transactions on company-issued card auto-tagged as corporate
  2. Manual: in personal account, mark any transaction as corporate reimbursable
- Location tracking: optional per transaction (always-on enforceable by employer)
- Bill photo attachment per transaction (already being built)
- Generate expense report: PDF/CSV download filtered by date, category, card, project code
- Report includes: merchant, amount, date, category, bill photo, GPS location if captured

#### For employers
- Company account registered separately
- Dashboard showing all employee expense submissions
- Verify/approve/reject per transaction or per report
- Download consolidated reports per employee, per department, per project
- Enforce policies: require location, require bill photo, set category limits
- Integration export: CSV compatible with Tally, Zoho Books, QuickBooks

#### Technical architecture
- New DB tables: companies, company_members, corporate_transactions, expense_reports
- Transactions get a new field: account_type (personal | corporate) + company_id
- Location: store lat/lng + address per transaction (optional/enforced)
- Report generation: Rust PDF/CSV generation endpoint
- Permissions: employer can set required_fields per company policy

#### Monetization
- Free: personal use only
- Pro (₹79/month): personal + Google Drive backup + multi-device
- Corporate (per seat pricing, e.g. ₹199/employee/month):
  - Expense reports
  - Employer dashboard
  - Policy enforcement
  - Location tracking
  - Bill photo mandatory option
  - Export to accounting software

#### Core belief alignment
- Minimalistic: employee sees one clean view, not two separate apps
- Snake_case throughout
- Backend Rust, Frontend React Native
- Every feature ships with tests

---

## Family Screen — Full Design Vision
*(This is the north star for the family feature)*

### Mental model
Same mental model across individual AND family screens. Filters (date, member) always present.
Individual screen = family screen with member filter set to "just me".

### Structure — 4 tabs inside each family group

#### Tab 1: Summary
- Stacked horizontal bar graph — 4 bars: Expenses / Income / Savings / Investments
- Each bar segment = one family member in their color
- Shows % contribution of each member to each category
- Tap any segment → drill into that member's data for that category

#### Tab 2: Income
- Total family income for the period
- Sources breakdown per member (salary, transfers, freelance etc.)
- Transfer detection: if member A sends same amount as member B receives on same account → marked as internal transfer, excluded from income
- Each member's income sources listed with amounts

#### Tab 3: Expenses
- Stacked bar or donut by category
- Family total per category
- Tap category → list of all family transactions in that category
- Sort by: member / date / amount
- Budget bar below each category (if budget set)
- Merchant/app breakdown also available

#### Tab 4: Investments
- Total family investments
- Breakdown by merchant/platform (Zerodha, Groww etc.)
- Tap merchant → list of all family investments there
- Filters: member / date / platform

#### Tab 5: Savings (estimated)
- Per member: Salary - Expenses - Investments = estimated savings this month
- Only shown if member has opted to reveal salary in Account settings
- Family total savings shown as aggregate
- Clearly marked as estimate

### Universal filters (every screen, every tab)
- Date range: This month / Last month / Custom
- Member filter: All / Individual member
- Filters persist within a session

### Privacy rules in family view
- A member can choose to hide specific transactions from family (mark as private)
- Admin cannot override member privacy settings
- Income is only shown if member opts in (Account → Family privacy settings)
- Private transactions shown as "Private transaction — ₹X" without merchant details

### Color coding
- Each family member gets a consistent color across all charts
- Colors assigned on join order: member 1 gets accent, member 2 gets invest color etc.
- Same color used in all bars, pie charts, member avatars

---

## Belief 11 — Cross-platform by default
Every component, screen, and utility must work on both iOS and Android without platform-specific forks.
- No `Platform.OS === 'ios'` branches for core functionality — only for unavoidable native differences (e.g. status bar height, keyboard behavior)
- All native modules chosen must have both iOS and Android support before adoption
- Test on both platforms before marking any feature complete
- If a library is Android-only (e.g. `react-native-get-sms-android`), the equivalent iOS experience must be designed upfront (e.g. manual entry fallback, email parsing as substitute for SMS)
- Single codebase, single release pipeline

---

## Future: Email receipt / invoice parsing (P3)
If a transaction receipt or invoice arrives in the user's email:
- Parse the email for amount, merchant, date, currency
- Match against existing transactions (by amount + merchant + date proximity)
- Surface in one unified place — same transaction list, not a separate inbox
- Show email sender, subject line, and timestamp alongside the transaction
- If both SMS and email exist for the same transaction: show both sources side by side, compare amounts and dates, flag any discrepancy

## Future: Transaction source transparency (applies now — P1)
Every transaction must always show its source provenance to the user:
- **SMS source**: sender ID (e.g. "VK-HDFCBK"), first 100 chars of SMS body, timestamp of SMS
- **Email source**: sender address, subject line, timestamp of email
- **Manual entry**: show "Added manually" with timestamp
- **If both SMS + email exist**: show both, compare amounts/dates side by side, highlight any mismatch
- **Metadata JSONB** is the storage layer for all raw source data — `raw_source_text`, `sender_id`, `email_subject`, `email_sender`, `email_timestamp`
- This is non-negotiable — users must always be able to verify where their data came from

---

## Belief 11 — Cross-platform by default
Every component, screen, and utility must work on both iOS and Android without platform-specific forks.
- No `Platform.OS === 'ios'` branches for core functionality — only for unavoidable native differences (e.g. status bar height, keyboard behavior)
- All native modules chosen must have both iOS and Android support before adoption
- Test on both platforms before marking any feature complete
- If a library is Android-only (e.g. `react-native-get-sms-android`), the equivalent iOS experience must be designed upfront (e.g. manual entry fallback, email parsing as substitute for SMS)
- Single codebase, single release pipeline

---

## Future: Email receipt / invoice parsing (P3)
If a transaction receipt or invoice arrives in the user's email:
- Parse the email for amount, merchant, date, currency
- Match against existing transactions (by amount + merchant + date proximity)
- Surface in one unified place — same transaction list, not a separate inbox
- Show email sender, subject line, and timestamp alongside the transaction
- If both SMS and email exist for the same transaction: show both sources side by side, compare amounts and dates, flag any discrepancy

## Future: Transaction source transparency (applies now — P1)
Every transaction must always show its source provenance to the user:
- **SMS source**: sender ID (e.g. "VK-HDFCBK"), first 100 chars of SMS body, timestamp of SMS
- **Email source**: sender address, subject line, timestamp of email
- **Manual entry**: show "Added manually" with timestamp
- **If both SMS + email exist**: show both, compare amounts/dates side by side, highlight any mismatch
- **Metadata JSONB** is the storage layer for all raw source data — `raw_source_text`, `sender_id`, `email_subject`, `email_sender`, `email_timestamp`
- This is non-negotiable — users must always be able to verify where their data came from


---

## Belief 11 — Cross-platform by default
Every component, screen, and utility must work on both iOS and Android without platform-specific forks.
- No Platform.OS === 'ios' branches for core functionality — only for unavoidable native differences (status bar height, keyboard behavior)
- All native modules must have both iOS and Android support before adoption
- Test on both platforms before marking any feature complete
- If a library is Android-only (e.g. react-native-get-sms-android), the equivalent iOS experience must be designed upfront (e.g. manual entry fallback, email parsing as substitute for SMS)
- Single codebase, single release pipeline

---

## Future P3: Email receipt and invoice parsing
If a transaction receipt or invoice arrives in the user's email:
- Parse the email for amount, merchant, date, currency
- Match against existing transactions by amount + merchant + date proximity
- Surface in one unified transaction list, not a separate inbox
- Show email sender, subject line, and timestamp alongside the transaction
- If both SMS and email exist for the same transaction: show both sources side by side, compare amounts and dates, flag any discrepancy

---

## Belief 12 — Transaction source transparency (non-negotiable)
Every transaction must always show its source provenance to the user.
- SMS source: sender ID (e.g. VK-HDFCBK), first 100 chars of SMS body, timestamp of SMS
- Email source: sender address, subject line, timestamp of email
- Manual entry: show Added manually with timestamp
- If both SMS and email exist for same transaction: show both, compare amounts and dates side by side, highlight any mismatch
- metadata JSONB is the storage layer for all raw source data: raw_source_text, sender_id, email_subject, email_sender, email_timestamp
- Users must always be able to verify where their data came from

---

## Belief 13 — Category keys are the single source of truth
Category values stored in the DB must always match the keys defined in `src/screens/spend/categories.ts`.
- DB stores the raw key (e.g. `food`, `entertainment`, `investment`) — never display labels
- Frontend always uses `getCat(category, merchant)` to get the display label, icon, and color
- `getCat()` has merchant-based fallback so even uncategorised transactions display correctly
- Valid category keys: food, groceries, shopping, transport, bills, entertainment, health, travel, investment, home, income, other
- If a new category is added to `categories.ts`, it must be added everywhere: frontend CATS, Rust category assignment, DB migration if needed
- Never store display labels ('Food & Dining') in DB — only store keys ('food')

---

## Belief 20 — Data integrity and attack prevention

### Principle
Data once written must be trustworthy. No attack — internal or external —
should be able to silently corrupt user data or community benchmarks.

### Layer 1 — Input validation (business logic bounds)
Every field validated on arrival beyond type checking:
  amount:        > 0, < 50,000,000 paise (₹5,00,000 hard ceiling per transaction)
  txn_date:      cannot be future, cannot be > 10 years ago
  category:      must be in valid key list (Belief 13)
  merchant:      max 100 chars, stripped of script/injection characters
  epoch_seconds: must be within 48 hours of server time
  
Anything outside bounds → rejected 400, logged as suspicious event.

### Layer 2 — Fingerprint dedup (existing)
Same transaction cannot be inserted twice.
fingerprint = hash(user_id + amount + merchant + txn_date).
Replay attacks and accidental duplicates blocked at DB level.

### Layer 3 — Per-user statistical anomaly detection
Every new transaction checked against user's own 90-day history:
  If amount > 10x user's 90-day category average:
    → Accept but set needs_review = true
    → Exclude from Tier 2 contribution until reviewed
    → User sees it in a "flagged" section, can confirm legitimate
  If > 50 transactions in 1 hour from same user:
    → Pause ingestion, require re-authentication
    
Silent flagging — attacker does not know they were caught.
User confirming a flagged transaction clears needs_review.
Tier 2 exclusion is based on statistical anomaly regardless of confirmation.

### Layer 4 — Tier 2 anomaly detection and quarantine
New Tier 2 contributions are quarantined for 24 hours before benchmark inclusion.
During quarantine:
  If contribution > 5x city median for that category → excluded permanently
  If a city shows > 10x spike in one category → flagged for review
  
24-hour delay on a read replica means successful poisoning takes
at minimum one day to show — giving time to detect and rollback.
Benchmark computation always runs on delayed replica, never live data.

### Layer 5 — Audit log
Every write operation (INSERT, UPDATE, DELETE) on transactions table logged:
  user_id, ip_address, endpoint, timestamp, payload_hash, old_value_hash
Not for prevention — for forensic recovery.
Audit log is append-only — never updated or deleted.
Can rollback to known-good state using audit log.

### Layer 6 — Rate limiting (3 levels)
Per user (authenticated):
  POST /transactions         → 100/hour
  POST /transactions/batch   → 10/hour
  GET  /transactions         → 300/hour
  Tier 2 contribution        → 1/week/category

Per IP (all requests):
  POST /auth/magic           → 5/hour
  GET  /auth/verify          → 10/hour
  Any endpoint               → 1000/hour

Global circuit breakers:
  POST /auth/magic           → 10,000/hour total
  Tier 2 contributions       → 50,000/hour total

All rate limit responses return 429 with Retry-After header.
Legitimate users know when to retry. Does not meaningfully help attackers.

### Layer 7 — Existing protections
  sqlx parameterized queries → SQL injection impossible
  Soft deletes only → no data permanently destroyed
  JWT short expiry in production (1 hour) → stolen tokens expire quickly
  Magic link single-use → no token replay
  Rust type system → entire classes of memory exploits eliminated

### What this prevents
  Replay attacks           → Layer 2 (fingerprint dedup)
  Data poisoning           → Layer 3 + 4 (anomaly detection)
  Benchmark manipulation   → Layer 4 (quarantine + median check)
  Brute force              → Layer 6 (rate limiting)
  SQL injection            → Layer 7 (sqlx)
  Silent data corruption   → Layer 5 (audit log)
  Token abuse              → Layer 7 (short expiry + single-use)

### What this does NOT prevent
  Attacker with valid account submitting plausible fake transactions slowly.
  At that point they corrupt only their own account (Tier 1 is isolated per user)
  and barely move Tier 2 benchmarks (1 user among 50+ minimum cohort).
  This residual risk is acceptable.

---

## Belief 21 — Data residency, retention and table size management

### Core principle
Data lives as close to the user as possible.
Our servers hold the minimum necessary for backup and community insights.
Storage cost scales with paid users only — free users cost us near zero.

### Data residency by tier

#### Free users
  Device (forever):
    All transactions stored in MMKV — never expires
    User owns this data — if they uninstall, it is gone
    No photos available on free tier

  Our server:
    users + customer_details row only (~700 bytes per user)
    Tier 2 anonymous contribution buckets — deleted 7 days after benchmark computed
    audit_log — 30 days raw, then dropped entirely
    Nothing else — we do not store free user transaction data

#### Paid users (solo)
  Device (forever):
    All transactions stored in MMKV — never expires

  Device (user-managed, separate folder):
    Bill photos stored in external storage folder (survives app uninstall)
    App shows: "Bill photos folder is X MB — tap to manage or delete"
    User can delete individual photos or clear all
    Photos folder location shown clearly in Account settings

  Google Drive (user owns):
    Encrypted bill photo backup
    Organised per user in their own Drive folder
    We never access this — user manages it directly

  Our server (3 years rolling):
    Encrypted transaction backup (ciphertext only — we cannot read)
    At 3 years: user notified, offered full export, then data purged
    After purge: only users + customer_details row remains

#### Paid users (family)
  Each member's device (forever):
    Their own transactions in MMKV — never expires

  Bill photos across family:
    Each member's photos stored in their own Google Drive folder (encrypted)
    Other family members see "📄 Bill available" on transactions

    View on demand:
      Tap "View bill" → fetches from scanner's Drive → decrypts → shows
      Nothing stored unless explicitly downloaded

    Download a copy:
      Tap "Save to my Drive" → encrypted copy saved to viewer's own Drive folder
      Once downloaded, copy belongs to the viewer permanently
      If original uploader leaves family or deletes original:
        Viewer's copy is unaffected — it is their own copy
        No notification sent — deletion is private

    Auto-download setting (default OFF):
      Settings toggle: "Automatically save family bills to my Drive"
      ON  → every new family bill photo copied to your Drive automatically
      OFF → manual download only
      Turning OFF does not delete previously auto-downloaded copies

  Our server (3 years rolling):
    Encrypted transaction backup for all family members
    Same purge policy as solo paid users

### Table retention policy

#### transactions
  Free users:    not stored on server
  Paid users:    3 years rolling from transaction date
  Deleted rows:  purge (hard delete) 30 days after deleted_at
  At 3 years:    notify user 30 days before purge, offer CSV/JSON export

#### audit_log
  Raw rows:      90 days
  After 90 days: aggregate to daily summary {date, user_id, action_count, table_name}
  Daily summary: kept 1 year
  After 1 year:  dropped entirely
  Forensic value after 1 year is near zero
  audit_log is append-only — no updates or deletes (enforced by DB rule)

#### spend_contributions (Tier 2 raw)
  Kept:          7 days after benchmark computed for that week
  After 7 days:  hard deleted — these are inputs, not outputs
  Never accumulate raw contributions
  Benchmark computation reruns are possible within the 7-day window

#### spend_benchmarks (Tier 2 output)
  Weekly granularity:  kept 2 years
  After 2 years:       compressed to monthly summary (one row per month per cohort)
  After 5 years:       dropped entirely
  Seasonal patterns require 2 years minimum — Diwali vs non-Diwali comparison

#### users + customer_details
  Kept while account is active
  On account deletion: anonymised within 30 days (name, email, phone nulled)
  Anonymised row kept 90 days for legal compliance then hard deleted

#### credit_cards + card_benefits
  Kept while card is marked active
  Soft delete on card removal (active = false)
  Hard delete 1 year after deactivation

### Automated cleanup jobs (Rust scheduled tasks)
  Daily at 02:00 IST:
    DELETE FROM transactions
      WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days';

    DELETE FROM spend_contributions
      WHERE created_at < NOW() - INTERVAL '7 days';

    DELETE FROM audit_log
      WHERE created_at < NOW() - INTERVAL '90 days';

  Monthly on 1st at 03:00 IST:
    Compress spend_benchmarks older than 2 years to monthly granularity
    Notify paid users whose data will hit 3-year mark within 30 days
    Hard delete transactions older than 3 years for paid users who were notified

### Table size monitoring
  Monitored weekly:
    transactions, audit_log, spend_contributions, spend_benchmarks

  Alert thresholds:
    Any table > 10GB    → immediate review
    audit_log > 1GB     → check cleanup job ran
    spend_contributions > 500MB → check benchmark job ran

  Growth is expected to be:
    transactions:       ~500 bytes × paid_users × 50 txns/month
    audit_log:          ~300 bytes × all_users × 5 writes/day × 90 days
    spend_contributions: ~200 bytes × all_users × 8 categories × 7 days max
    spend_benchmarks:   ~100 bytes × cities × cohorts × 104 weeks

---
## Belief 22 — Manual transaction correction is always available

Users must always be able to correct what the parser got wrong. No automated system is perfect.

- Every transaction has a ✏️ "Correct this transaction" UI in TxnDetailScreen
- Correctable fields: merchant name, category, amount, txn_type
- On correction: `verified = true` set in DB, `manually_corrected: true` added to metadata
- Corrected transactions show an "Edited" badge in the detail screen
- Manual corrections are never overwritten by re-scans or background jobs
- Category correction goes through the same `CATS` key list (Belief 13) — no free-form category strings
- Amount correction stored in paise (Belief 8) — UI accepts rupees, converts before sending
- API: `PATCH /transactions/:id/correct` — partial update, only provided fields are changed
- Correction data feeds the ML categorization training pipeline (Belief 23)

---
## Belief 23 — SMS/Email parsing is a pipeline, not a one-time event

Parsing quality improves over time. The system is designed for iteration, not perfection at launch.

### Current pipeline (MVP)
1. Java layer: read SMS inbox, filter OTPs, return raw messages
2. JS layer (`sms.ts`): `is_financial_sender()` pre-filter, `parse_sms()` extraction
3. Rust batch handler: `normalise_merchant()` + keyword category fallback
4. DB: stores parsed fields + full raw SMS in `metadata.raw_source_text`
5. User: can correct any field via TxnDetailScreen (Belief 22)

### Parser improvement path
- Every manual correction = one labelled training example
- At ~500 corrections: fine-tune a MobileBERT/DistilBERT text classifier on-device (< 30MB)
- Input: `(raw_merchant_string, sms_body_snippet)` → Output: `category`
- Inference: on-device via TensorFlow Lite or ONNX Runtime React Native
- Near-term fallback: Claude API nightly job on `WHERE category IS NULL` rows

### Raw SMS transparency
- `metadata.raw_source_text`: first 300 chars of original SMS body (stored at parse time)
- `metadata.sender_id`: bank sender ID (e.g. `AD-SBICRD-S`)
- `metadata.sms_timestamp_ms`: epoch ms of original SMS
- `metadata.parse_version`: version string of parser that created this record
- Always visible to user in TxnDetailScreen → "📨 Raw SMS log" expandable section
- This is non-negotiable per Belief 12

### Financial sender detection
- `is_financial_sender(sender)` in `sms.ts` pre-filters before parse attempts
- Checks both raw sender and stripped (removes `VM-`, `AX-` etc. operator prefixes)
- Fragment list: BANK, HDFC, ICICI, SBI, AXIS, KOTAK, INDUS, YESB, PNB, BOI, CANARA,
  UNION, IDFC, PAYTM, AMEX, CITI, STANC, CARD, UPI, NEFT, IMPS, CREDIT, DEBIT, WALLET, RUPAY
- Unknown senders still pass if body contains Rs/INR/₹ — financial content overrides sender check

### Known parser limitations (as of 2026-03-26)
- Raw bank strings like `ZEPTOMARKETPLACEPRIVATE`, `BHARTIAIRTELLTD` not normalised before storage
- Merchant normalisation happens in Rust batch handler but not in JS `parse_sms()`
- Solution: `getCat(category, merchant)` on frontend uses regex match fallback — display is correct
  even when DB merchant is raw string
- Proper fix: run `normalise_merchant()` in JS before batch submit (planned)

---
## Belief 24 — SMS historical backfill is user-controlled, not automatic

The app never silently ingests data without user knowledge.

### Backfill design
- `backfill_sms(opts)` in `sms.ts` accepts: `from_ms`, `to_ms`, `on_progress`, `max_sms`
- Default range: last 6 months (configurable by user in LinkedAccountsScreen)
- User picks scan period: 1 Month / 3 Months / 6 Months / 1 Year
- Live progress reported via `ScanProgress` callback:
  `reading → filtering → parsing → submitting → done`
- Progress shown as animated bar with step label and stats (parsed / new / skipped)
- Dedup: `local_id = sms_{timestamp}_{amount}` — safe to re-scan, duplicates skipped server-side
- Permission wall: if READ_SMS not granted, shows 🔒 "Grant SMS Access" before scan buttons appear

### Batch submit
- Parsed SMS sent to `POST /transactions/batch` in chunks of 50
- Backend deduplicates via fingerprint `hash(user_id | amount | acct_suffix | time_bucket_120s)`
- Response: `{ created, merged, skipped, errors }` — all counted in progress UI
- 150ms delay between chunks — avoids flooding backend

### Email accounts
- User can add Gmail/Outlook addresses in LinkedAccountsScreen
- Stored locally in MMKV via `EmailAccounts` store
- Gmail OAuth integration is Phase 1 — accounts registered now, scanning enabled on activation
- No credentials stored — OAuth token flow handled at activation time

### Entry points
- Home screen: "Import Bank SMS & Emails" banner (dismissible, reappears after new scan)
- Account screen: "Import Bank SMS & Emails" button
- LinkedAccountsScreen: full scan UI with date picker and email management

---
## Feature Status Update — 2026-03-26

### ✅ DONE (added this session)
| Feature | Notes |
|---------|-------|
| SMS historical backfill with date range | User picks 1M/3M/6M/1Y, live progress bar, batch submit |
| `is_financial_sender()` pre-filter | Strips operator prefixes, checks 25 bank fragments |
| Java SMS LIMIT bug fix | Removed LIMIT from sortOrder (broke on OPPO/ColorOS) |
| Permission wall in LinkedAccountsScreen | Shows grant button if READ_SMS not granted |
| Raw SMS body in metadata | `raw_source_text` stored at parse time, shown in TxnDetailScreen |
| TxnDetailScreen: manual correction UI | Merchant, category pills, amount — PATCH /transactions/:id/correct |
| TxnDetailScreen: Raw SMS log section | Expandable, shows sender, timestamp, full body |
| SelfScreen: ALL CATEGORIES (not just expenses) | Investments in orange, income in green, expenses in red |
| SelfScreen: Recent Transactions with pagination | All txns newest first, 15 at a time, Show more button |
| Category pattern expansion | 50+ new merchant fragments: Instamart, SwiggyLimited, Zepto, Bharti, etc. |
| Email account management | Add/remove Gmail/Outlook in onboarding + LinkedAccountsScreen |
| Rust `/transactions/:id/correct` endpoint | Partial update, sets verified=true, logs corrected_at |
| LinkedAccountsScreen | Full screen: SMS scan + email accounts + last scan summary |
| Onboarding: bank_email step | Between SMS permission and login email step |
| Home: SmsScanBanner | Import prompt / done summary, dismissible |

### 🔄 STILL IN PROGRESS
| ID | Issue | Priority |
|----|-------|----------|
| SMS parser merchant normalisation | JS should normalise before batch submit, not rely on getCat() fallback | HIGH |
| Category assignment in batch | Rust keyword fallback added but needs expansion | MEDIUM |
| Email parsing (Gmail OAuth) | Accounts registered, parsing not yet active | MEDIUM |
| ML categorization | Training data accumulating via manual corrections | LOW |

---
## Belief 25 — Two-tier data architecture: Device-private vs Server-global

### Core principle
Customer data never leaves the device unencrypted. Global intelligence is crowd-sourced
and anonymised — never linkable to any individual.

### Tier 1 — Device only (customer-private)
These tables live on the customer's device and in their encrypted backup only.
Our server NEVER sees the plaintext of these tables.

| Table | Purpose |
|-------|---------|
| `transactions` | All transaction records with amount, merchant, date, account |
| `user_accounts` | Customer's own bank accounts and cards |
| `user_account_details` | Account metadata: bank name, suffix, balance, payment method |
| `customer_details` | Customer profile: name, city, age bracket |
| `spend_contributions` | Raw input before anonymisation — deleted after aggregation |

**Rules for Tier 1:**
- No customer_id, email, phone, or any PII in any global table
- Transactions stay on device — server only stores encrypted blob for backup
- If customer deletes account: all Tier 1 data is hard-deleted within 30 days
- Export always available — customer owns their data

### Tier 2 — Server-global (shared intelligence)
These tables are maintained on PaisaLog's server and synced to customer devices.
They contain ZERO customer-identifiable information — only aggregated patterns.

| Table | Purpose |
|-------|---------|
| `merchants` | Canonical merchant names, categories, LOB hints |
| `merchant_aliases` | Raw string → merchant_id mappings (crowd-sourced) |
| `spend_benchmarks` | Aggregated cohort benchmarks — no individual data |
| `category_rules` | Global categorisation rules, updated centrally |

**Rules for Tier 2:**
- NEVER store customer_id, user_id, household_id, or any identifier
- NEVER store individual transaction amounts or dates
- Aggregation minimum: cohort must have ≥ 50 members before benchmark computed
- merchant_aliases are crowd-sourced — contributed anonymously, no contributor tracked
- spend_benchmarks store only: week, city_tier, age_bracket, category, p25/p50/p75
- Any analyst with full access to Tier 2 must be unable to reconstruct any individual's transactions

### What this prevents
- Data breach of Tier 2 exposes zero customer financial data
- Even a rogue PaisaLog employee cannot link Tier 2 data to a specific customer
- Regulatory compliance: financial data stays on customer device (RBI guidelines)
- Trust: we can publicly publish the Tier 2 schema without privacy concerns

### Merchant intelligence model
Merchant data flows one-way: Device → anonymised contribution → Tier 2 aggregation → all devices
- Customer corrects "SWIGGYLIMITED" → "Swiggy" on their device
- Correction is contributed anonymously as alias_raw + alias_canonical (no user_id)
- When ≥ 10 devices contribute same alias: it gets promoted to global merchant_aliases
- Devices sync merchant_aliases weekly (lightweight, ~500KB for top 10,000 merchants)

### Payment method classification (device-only)
Derived from SMS body at parse time, stored in transactions.payment_method:
  'upi'        — UPI/BHIM/Google Pay/PhonePe patterns
  'card'       — Credit/Debit card patterns  
  'netbanking' — NEFT/IMPS/RTGS patterns
  'emi'        — EMI/instalment patterns
  'cash'       — ATM/cash withdrawal patterns
  'wallet'     — Paytm/Mobikwik/Amazon Pay wallet patterns
  null         — unknown/not parsed

---
## Belief 26 — Financial SMS detection by content, not sender

### Problem with sender-based filtering
Hardcoding bank names (HDFC, ICICI, BOB, SBI...) in code is brittle:
- India has 10,000+ banks — no static list can be complete
- Banks change their SMS sender IDs
- Banks merge (e.g. Vijaya Bank → Bank of Baroda)
- New payment rails and wallets appear constantly

### Solution: content-based detection
Detect financial SMS by what they SAY, not who sent them:
- Contains amount pattern: Rs.X / INR X / ₹X
- Contains transaction verb: debited / credited / spent / withdrawn
- Contains account reference: A/C / Acct / account...XXXX
- Contains payment rail: UPI / NEFT / IMPS / RTGS

### Rules
- `is_financial_sender(sender, body)` — body is the primary signal
- Sender is only a fallback when body is unavailable
- OTP messages are rejected first regardless of sender
- Promotional messages without transaction verbs are rejected
- Any registered SMS sender (6-char alpha) passes the sender check
- No hardcoded bank name lists anywhere in the codebase

### Config-driven sender hints (Tier 2, optional)
- Server maintains a `sender_hints` table: sender_id → bank_name, account_type
- Device syncs this weekly (lightweight, ~100KB)
- Used ONLY for display purposes (showing "SBI Credit Card" instead of "AD-SBICRD-S")
- Never used for filtering — content always wins

## BELIEF 22: Wallet top-up transfer detection (Future)
Wallet top-ups (Amazon Pay, Paytm, PhonePe) from bank accounts are technically
transfers, not expenses. However, distinguishing wallet top-ups from real purchases
at the same merchant (Amazon orders vs Amazon Pay top-ups) requires additional
signals beyond what SMS provides today.
Current state: wallet transactions are counted as expenses.
Future: detect via UPI VPA patterns (amazonpay@apl vs amazon.in) or explicit
"wallet" keyword in SMS body. Phase 2 work.
