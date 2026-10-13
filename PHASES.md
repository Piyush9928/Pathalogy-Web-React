# LabSync Pro — Rebuild Phase Roadmap

Rebuild of the ASP.NET Core MVC "Pathalogy" project (`d:\RJ Project\Pathalogy`) as
React + Vite (frontend) + Node.js + Express + PostgreSQL (backend), in this sibling
folder (`Pathalogy-Web`). Same functionality, same UI/theme, built incrementally.

Phases below mirror the original project's `Brain.md` module list and `PENDING.md`
feature list, reordered slightly so each phase is independently usable.

## ✅ Phase 1 — Foundation (DONE)
- JWT authentication (hospital code + email + password), account lockout policy
- RBAC: static permission catalog (14 modules), roles with `permissions text[]`
- Branch management (CRUD, primary branch, activate/deactivate)
- User management (CRUD, reset password, last-Super-Admin protection)
- Company settings (GST, UHID prefix, barcode config, notification toggles)
- Audit log (every mutating action logged, filterable)
- Dashboard (KPI cards, revenue/booking/test-volume charts, activity feed, quick actions)
- Sidebar/topbar/footer layout matching the original design (colors, fonts, spacing)

**Seeded demo data:** hospital `CITYCARE`, 12 roles, 3 branches, 14 users, password `Test@123`.

## ✅ Phase 2 — Patient & Doctor Management (DONE)
- Patient registration with auto-generated sequential UHID (`{PREFIX}-{YEAR}-{000001}`,
  prefix pulled from Company Settings — improvement over the original, which hardcoded
  `"UHID"` and derived the sequence from the row's own auto-increment id)
- Patient search (name/UHID/phone) with pagination, autocomplete endpoint for future
  booking/billing typeahead pickers
- Patient detail, edit, activate/deactivate (new — the original only had hard delete),
  hard delete
- Referral tracking: Self / Doctor / Collection Center, with cross-field validation
- Doctor management: CRUD, card-grid list (matches original), commission %, referral
  stats (total referrals/revenue), autocomplete endpoint
- Doctor detail page shows patients referred by that doctor
- Both modules now properly permission-gated (`patients.*`, `doctors.*`) — the original
  `DoctorController` had no permission checks at all, fixed here

**New tables:** `patients`, `doctors`, `uhid_counters`.
**Deferred to a later phase (as in the original, tagged "Phase 15"):** commission
overrides (`CommissionSetting`), non-doctor referral persons, referral commission
payment ledger — these extend Doctor but are a distinct module.
**Not carried over:** patient visit history report, registration card printing,
medicine history, patient statistics — these depend on Bookings/Reports/Invoices/
Pharmacy modules from later phases and will be added once those exist.

## ✅ Phase 3 — Laboratory Masters (DONE)
- Department master (CRUD, blocks delete while tests are assigned)
- Test Master: code/name/department/sample type/container/price/TAT, gender+age-banded
  reference ranges (separate editor screen, matches original), pricing/commission options
- Test Packages: bundle multiple tests, auto-computed list price / savings %, card-grid UI
- Sample Type master (icon-based) and Container master (cap-color swatches + legacy fields)
- Analyte Master: 50+ seedable catalog entries, gender/age reference bands, critical
  low/high thresholds, result type (Numeric/Text/Dropdown/Boolean), grouped-by-category list

**New tables:** `departments`, `sample_types`, `containers`, `tests`,
`test_reference_bands`, `test_components`, `test_packages`, `test_package_items`,
`analytes`, `analyte_reference_bands`, `test_analytes`.

**Deviations from the original (flagged, not silent):**
- Department/SampleType/Container are proper FK columns on `tests`, not free-text
  string matching like the original.
- Added `tests.gst_percent` — the original had no GST/tax field on any lab master at
  all, which doesn't fit Indian billing compliance.
- Added `test_analytes` join table — the original never linked `TestMaster` to
  `AnalyteMaster`; this will drive Phase 5 (result entry) analyte rows per test.
- `test_package_items` is a real join table; the original just kept a raw `List<int>`
  with no relational integrity.

## ✅ Phase 4 — Booking & Sample Collection (DONE)
- Unified booking flow for Walk In / Online / Doctor Referral / Corporate / Collection
  Center / Home Collection (one `booking_type` discriminator, one status vocabulary)
- Test + package selection with live subtotal/balance calculation, package provenance
  preserved (`booking_tests.source_package_id`)
- Sequence-based booking numbers (`BK-{yyyyMMdd}-{seq}`) and sample barcodes
  (`{prefix}-{seq}`, prefix from Company Settings)
- Status tracking rail (Booked → Collected → Processing → Verified → Approved →
  Delivered, or Cancelled) with a full audit trail (`booking_status_events`)
- Home collection dispatch: phlebotomist assignment, OTP-gated sample collection,
  vial barcode capture, "received at lab" marking
- Printable sample label with QR code (client-generated, matches original's format)
- Doctor referral counters (`total_referrals`/`total_revenue`) update automatically
  when a booking has a referring doctor

**New tables:** `bookings` (unified), `booking_tests`, `booking_status_events`,
plus `booking_number_seq`/`sample_barcode_seq` sequences.

**Deviations from the original (flagged, not silent):**
- The original split walk-in bookings and home collection into two disconnected
  entities with different status vocabularies and free-text (not FK) test lists.
  Unified here into one table/status flow — simpler to build on for later phases.
- `patient_id`/`doctor_id` are real FKs, not denormalized name/UHID strings.
- Booking/barcode numbers use Postgres sequences instead of the original's
  `COUNT(*)`, which could produce duplicate numbers after any row deletion.
- **Invoice auto-creation is deferred to Phase 6.** The original synchronously
  created an `Invoice` inside booking creation (and had a bug where the invoice's
  payment mode was always hardcoded to "Cash" regardless of the booking's actual
  payment mode). Since Billing doesn't exist yet here, bookings store
  `total_amount`/`paid_amount`/`payment_mode`/`payment_status` directly as the
  source of truth; Phase 6 will generate a real invoice from a booking.

## ✅ Phase 5 — Laboratory Processing (DONE)
- Report shell auto-created when a booking's status advances past "Booked" (one
  report per booking, covering all its tests together, matching the original)
- Result entry seeded from each booked test's linked analytes, with unit/reference
  range auto-populated correctly by patient gender + age
- Auto-flag calculation (Normal/Low/High/Critical) recomputed server-side on save
  using the analyte's real critical thresholds — never trusts the client-submitted flag
- Verification → Approval (hand-drawn canvas signature, matches original) → Delivery
  workflow, plus Reopen for corrections
- Critical result banner + audit trail entry when any result flags Critical
- Pathologist notes (now actually persisted — see deviation below)
- Printable report layout with signature block and processing trail

**New tables:** `test_reports`, `report_results`, plus `report_number_seq`.

**Deviations from the original (flagged, not silent):**
- `booking_id` is a real FK on `test_reports`; the original cross-referenced by a
  plain `BookingNumber` string.
- `report_results.analyte_id` is a real FK to `analytes`; the original matched
  analytes by free-text name at runtime against `AnalyteMaster`/`TestMaster`.
- **Fixed a real bug**: the original's reference-band gender matching compared
  against the literal string `"Both"`, which never matched actual band values
  (`All`/`Male`/`Female`/`Child`) — so gender-aware ranges silently never applied,
  and age was never checked at all. Here gender + age are matched correctly.
- **Improved the critical-flagging logic**: the original used a relative-multiplier
  heuristic (Critical if value < 60% of the low bound or > 160% of the high bound),
  which is not a real panic-value methodology and never consulted the
  `critical_low`/`critical_high` fields that already existed on `AnalyteMaster`
  (unused in the original). Here those real thresholds drive the Critical flag.
- Added a real `notes` column — the original's pathologist-notes field was marked
  `[NotMapped]` in EF Core, meaning it was **never actually saved to the database**
  despite appearing in the UI.

## ✅ Phase 6 — Billing (DONE)
- Manual invoice creation (patient/doctor/booking reference, multi-line items, GST
  0/5/12/18%, flat discount, credit-sale terms) — matches the original's fully
  manual `Create` flow (there was no auto-invoice-from-booking action to port)
- CGST/SGST 50/50 split display, computed taxable value/grand total/balance due
- Real payment history (see deviation below) and refund tracking
- Billing reports: Daily Collection, Department Workload, Doctor Commission Ledger
  (computed live from revenue × commission %, no ledger table — matches original),
  Revenue (day-wise billed/collected/refunded + payment-mode share), Due/Outstanding
  aging (0-30/31-60/61-90/90+ days, per invoice)
- Printable invoice layout with line items, tax breakdown, and payment history

**New tables:** `invoices`, `invoice_line_items`, `payments`, plus `invoice_number_seq`.

**Deviations from the original (flagged, not silent):**
- `patient_id`/`booking_id` are real FKs on `invoices`; the original cross-referenced
  by denormalized PatientUhid/BookingNumber strings.
- `invoice_line_items` is a real join table instead of an EF owned collection.
- **Added a real `payments` table — a genuine gap fix.** The original's
  `RecordPayment` action did an in-place `PaidAmount += amount; PaymentMode = mode`,
  which silently discarded installment history: paying ₹500 cash then ₹1000 UPI left
  the invoice showing only `PaidAmount=1500, PaymentMode="UPI"`, with no record the
  first ₹500 was cash. Here every payment is its own row.
- Added proper permission checks (`billing.create`/`billing.edit`) on payment and
  refund actions — the original had none on those two endpoints.
- Skipped `BillAdjustment`/`CreditNote` (post-payment invoice correction workflow)
  and `ReferralCommissionPayment` (batch commission payout ledger) — both are
  separate modules in the original, out of core Billing scope; can be added later
  if needed.

## ✅ Phase 7 — Inventory (DONE)
- Inventory items (reagents, consumables, QC materials, stationery, equipment) with
  low-stock/expiry KPIs
- Real stock ledger (every purchase receipt and manual adjustment writes a row —
  not a silently-overwritten running total)
- Expiry Alert screen (Expired / Expiring Soon / Good Stock buckets, configurable
  days-ahead window)
- Purchase Orders: Draft → Ordered → Received (stock increases automatically on
  receipt, with matching ledger entries) or → Cancelled
- Supplier master with a real FK chain from inventory items and purchase orders
- Stock classification masters (Group → Sub-Group → Commodity, Unit) as optional
  metadata, matching the original's "legacy parity" treatment

**New tables:** `inventory_items`, `stock_ledger`, `purchase_orders`,
`purchase_order_lines`, `suppliers`, `stock_group_masters`,
`stock_sub_group_masters`, `commodity_masters`, `unit_masters`.

**Deviations from the original (flagged, not silent):**
- Added a real `suppliers` table with proper FKs. The original had **three
  disconnected supplier concepts**: a free-text `Supplier` string on
  `InventoryItem`, a separate free-text `Supplier` string on `PurchaseOrder`, and
  an entirely unrelated generic-Contacts-with-Category="Vendor" system for
  supplier bill/payment tracking — none of them linked to each other. Unified here.
- Added `gst_percent` to purchase order lines — the original had no GST field on
  `PurchaseOrder`/`PurchaseOrderLine` at all; GST only appeared synthetically in
  the Purchase Register report layer, never actually stored.
- Added permission checks on every mutating route. The original only guarded
  `Index`/`Create` on `InventoryController` — `Edit`, `Delete`, `AdjustStock`,
  every Purchase Order action, and all classification-master CRUD had **zero**
  permission checks.
- **Not fixed (inherited limitation, explicitly flagged rather than silently
  copied)**: inventory items still track a single `current_stock` and a single
  `expiry_date` per item, with no batch/lot support. The original's Pharmacy
  module has a `MedicineItem.Batches` pattern for exactly this need, but
  Inventory never received the equivalent treatment — if two purchase orders
  deliver the same reagent with different expiry dates, neither the original nor
  this rebuild can represent that distinction. Worth revisiting as a follow-up
  if batch-level expiry tracking becomes important.
- Quality Control (`QualityControlRun`) and Calibration (`CalibrationRecord`) were
  **not carried into this phase** — confirmed they have no FK/relationship to
  `InventoryItem` in the original at all (no stock is consumed by a QC run); they
  were only co-located in the same controller/nav. Treated as a separate future
  module rather than core Inventory.

## ✅ Phase 8 — Advanced Features (Blood Bank, Pharmacy, OT/Surgery, IPD/OPD, Radiology, Notifications/Machine Integration) — ALL SUB-PHASES DONE
This is the largest phase in the original app — split into sub-phases 8a–8f, all complete:

### ✅ Phase 8a — Blood Bank (DONE)
- Dashboard (KPIs, blood-group distribution with low-stock flagging)
- Inventory: receive/edit/quarantine/discard blood units, barcode/QR lookup by
  unit number (immutable once set, matching the original), component breakdown
- Requests: raise/approve/reject/cancel, priority levels (Normal/Urgent/
  Emergency/Critical)
- Cross-Match / Compatibility Testing: manual attestation (blood group + Rh
  checkboxes + result), lab report upload (PDF/PNG/JPG, 20MB), approve/reject
  with automatic unit reserve/release cascade
- Issue: triple re-verification at issue time (request Approved + cross-match
  Approved & Compatible + unit available and unexpired) — matches the
  original's "belt-and-suspenders" design exactly
- Return: temperature + quality check, auto-derived Restocked/Rejected outcome
- Reservation: Surgery/ICU/Emergency types, with or without a specific unit
- Storage: fridge/freezer locations, temperature logging with out-of-range
  detection and audit trail

**New tables:** `blood_units`, `blood_requests`, `compatibility_tests`,
`blood_issue_records`, `blood_return_records`, `blood_reservations`,
`blood_storage_locations`, `blood_storage_temperature_logs`.

**Matched exactly from the original (not a gap, a deliberate choice):**
- No automated ABO/Rh compatibility matrix exists in the original — cross-match
  is purely manual human attestation. Real clinical decision support (e.g.
  encoding "O- is the universal donor") doesn't exist to port and is out of
  scope for this rebuild.
- No per-component shelf-life rule (Platelets ~5 days vs Plasma ~1 year frozen,
  etc.) — expiry is operator-entered at receive time, same as the original.

**Deviations from the original (flagged):**
- Real FKs (`patient_id`, `doctor_id`, `department_id`) instead of denormalized
  name strings.
- Number sequences (unit/request/issue-slip/reservation numbers) use real
  Postgres sequences for consistency with earlier phases.

**Deferred:** Doctor Portal self-service blood requests (doctors raising their
own requests) — confirmed additive and non-blocking in the original; it reuses
the same `BloodRequest` model but needs a separate doctor-portal auth mechanism
that doesn't exist yet in this rebuild. Fast-follow candidate once a doctor
portal is built.

### ✅ Phase 8b — Pharmacy (DONE)
- Medicine item master (category, manufacturer, GST, MRP, brand type) with per-item
  computed stock/low-stock/expiry flags
- Real batch tracking (`medicine_batches`) — this is the batch/lot model the original's
  Phase 7 Inventory module lacked; Pharmacy always had it
- Purchases: receiving creates new batches with their own expiry/rate/MRP
- POS Sale: cart-based checkout with fully automatic FEFO (first-expiry-first-out)
  batch deduction — the operator only picks medicine + quantity, batch selection,
  price, and GST are all resolved server-side (matches the original's anti-tampering
  design exactly, and the same all-or-nothing stock validation across every cart line)
- Narcotics Register: standalone compliance ledger for Schedule H1/X/NDPS drugs,
  not linked to POS stock (matches the original — this is a manual regulatory
  record, not an automated deduction)
- Reports: Stock Balance (batch-wise), Expiry Report (5 buckets: Already Expired /
  0-30 / 31-60 / 61-90 / 90+ days), Sales Register (per-line GST/discount breakup)

**New tables:** `pharmacy_stores`, `hsn_masters`, `item_salt_masters`,
`item_make_masters`, `discount_masters`, `medicine_items`, `medicine_batches`,
`medicine_purchases`, `medicine_purchase_lines`, `medicine_sales`,
`medicine_sale_lines`, `sale_line_batches`, `narcotics_register_entries`.

**Kept deliberately separate from Phase 7 Inventory** (matches the original's own
architecture) — retail medicine stock and lab reagent stock have different tax/
batch/dispensing rules; no shared tables, no shared supplier master.

**Deviations from the original (flagged):**
- `medicine_batches` is a real relational table with a proper FK. The original
  stored batches as a JSON column on the item row — an EF Core implementation
  detail for its in-memory-first prototype, not a deliberate design choice.
- Added `sale_line_batches` for real per-batch traceability, replacing the
  original's comma-joined `"BATCH001, BATCH002"` string on the sale line.
- **Added a full `pharmacy.*` permission module and applied it to every route.**
  The original `PharmacyController` had zero `[RequirePermission]` attributes
  anywhere — worse than even the Inventory/Doctor gaps found in earlier phases,
  including on the narcotics register (a controlled-substances compliance
  record) and on sales themselves (a financial transaction that mutates stock).

**Deferred:** e-Prescription → Pharmacy dispensing integration. Confirmed the
Pharmacy module has no hard dependency on it (only a "1-click dispense from Rx"
convenience action would need it), and the original's own implementation of that
action has a bug (matches medicine by fuzzy name instead of the FK that already
exists) that would need fixing anyway if built here.
### ✅ Phase 8c — OPD/IPD (DONE)
- OPD token queue: doctor+shift+head+date-scoped sequential tokens (matches the
  original's uniqueness rule), richer status flow (adds Calling/Skipped),
  priority ordering, vitals capture, diagnosis/consultation notes, consultation fee
- Visual Bed Board: a real ward → bed → current-occupant grid
- IPD admissions: admit (validates bed availability), running per-stay bill
  (room/doctor-visit/nursing/medicine/procedure/investigation/other charge lines,
  payments, computed totals matching the original's exact formula chain), daily
  treatment notes, bed transfer (with automatic post-transfer bed status flip),
  structured discharge (Normal/DAMA/LAMA/Death/Transfer)
- Wards master with bed-count-at-creation convenience

**New tables:** `ipd_panels`, `wards`, `beds`, `opd_visits`, `ipd_admissions`,
`ipd_charge_lines`, `ipd_payments`, `ipd_doctor_visits`, `ipd_treatment_notes`,
`ipd_bed_transfers`. Added `ipd_admission_id`/`opd_visit_id` to the existing
`bookings` table from Phase 4.

**This sub-phase fixed more real gaps than any other so far** (these are missing
data modeling, not legitimate scope exclusions like Blood Bank's compatibility
matrix):
- **No bed entity existed at all in the original.** A ward only stored a bare
  `TotalBeds` count; bed identity/occupancy was derived by string-matching a
  free-text `BedNumber` field on admissions against nothing — two different
  wards could collide on the same bed number, and typos silently created
  phantom beds. Built a real `beds` table with a proper FK and status enum;
  the "visual bed board" is now an actual query instead of a fragile view-side
  join of three unrelated lists.
- **Two disconnected OPD queue systems existed** (`OpdVisit`, modeled on a
  legacy table, vs. a separate newer `QueueToken` with richer status/priority/
  timestamps) that were never reconciled. Consolidated into one `opd_visits`
  design taking the better parts of both.
- **OPD visits had no vitals, consultation notes, diagnosis, fee, or billing
  link at all.** Added all of these — genuinely new capability, not a port.
- **Discharge summary was a single free-text blob** with no structured fields
  for treatment given, condition at discharge, or follow-up instructions.
  Split into real columns.
- **No linkage existed between lab bookings and an IPD stay.** An admitted
  patient's lab tests had no path to their running bill — `Booking` had no
  `IpdAdmissionId`/`OpdVisitId` field anywhere. Added both as nullable FKs on
  `bookings`, and booking creation now auto-posts an "Investigation" charge
  line onto the patient's active stay when applicable.
- **Added full `opd.*`/`ipd.*` permission modules and applied them to every
  route.** The original's `OpdController`/`IpdController` had zero
  `[RequirePermission]` attributes anywhere — the same systemic gap found in
  Doctor/Inventory/Pharmacy controllers.
### ✅ Phase 8d — Operation Theatre & Surgery (DONE)
- OT Theatres board: card grid with live status (Available/In Surgery/Under
  Fumigation/Maintenance), equipment summary, fumigation-due warning banner,
  inline status change
- Surgery Procedure Master: code/name/department/type (Major/Minor/Emergency/
  Day Care), estimated duration, standard cost, blood-arrangement/ICU-booking flags
- Surgery Schedule: KPI cards (Scheduled/In Surgery/Completed Today), filter by
  status/theatre/date, create form with live end-time suggestion from the
  procedure's estimated duration, and slot-conflict errors surfaced directly
  from the API (room double-booking or surgeon double-booking)
- Case Sheet detail: status progression rail (Scheduled → Pre-Op Holding →
  In Surgery → PACU/Recovery → Completed, or Postpone/Cancel side actions) with
  optional append-only note on each transition, Pre-Op checklist (NPO/Consent/
  Blood Arranged/PAC Cleared) plus pre-op/post-op diagnosis and implant details,
  biopsy/specimen dispatch to Pathology, and a running surgical notes log
- Fumigation Log: theatre-scoped log entries (type, start/complete time, air
  sample sent, microbiology clearance status), which automatically pushes the
  parent theatre's `last_fumigated_on`/`next_fumigation_due` (+7 days)

**New tables:** `operation_theatres`, `surgery_masters`, `surgery_bookings`,
`ot_fumigation_logs`, plus a `surgery_case_number_seq` sequence.

**Critical finding that shaped this sub-phase:** the original's entire Surgery/OT
module is served by an in-memory `List<T>` inside `FakeDataService` —
`EfFakeDataService` never overrides any of its methods, so despite `DbSet<T>`
declarations existing on the EF context, none of it is ever actually persisted
to the database. There was no real schema to reverse-engineer; this sub-phase
was free to design the schema properly from scratch rather than replicate a
broken one.

**Deviations from the original (flagged, not silent):**
- Real `patient_id` FK on `surgery_bookings`, replacing the original's
  denormalized patient name/UHID strings.
- **Added `ipd_admission_id` (nullable FK) — a genuine gap fix.** The original
  had no linkage at all between a surgery case and the patient's inpatient
  stay, even though pre-op holding for an admitted patient often *is* their
  ward bed. Consistent with the Phase 8c fix of linking bookings to
  `ipd_admission_id`.
- **Real specimen-dispatch-to-Pathology integration, replacing a cosmetic
  original.** The original's `SendSpecimenToLab` action only set three flags/
  strings on the surgery record itself (`specimen_sent_to_pathology=true`, a
  weak millisecond-precision barcode `SP-OT-{id:D3}-{ms}`, a description) and
  wrote an audit log — no real `Booking` or `TestReport` was ever created, so
  the "dispatched" specimen never actually appeared in any lab queue and had
  no way to receive a result. Here, dispatching a specimen creates a real
  `bookings` row (via the same `generateBookingNumber`/`generateBarcode`
  utilities from Phase 4) with a histopathology test attached, linked back via
  `surgery_bookings.specimen_booking_id`.
- **Added a full `surgery.*` permission module and applied it to every route.**
  Every single `SurgeryController` action in the original had zero
  `[RequirePermission]` attributes — the worst permission gap found across all
  phases so far, notable because Surgery/OT is described in the original's own
  `PENDING.md` as one of the more recently built, more "complete" modules.
- Room and lead-surgeon slot-conflict detection is replicated exactly: classic
  interval overlap (`start < otherEnd && end > otherStart`), excluding
  Cancelled/Completed bookings and the booking being edited. No equipment/
  anesthetist/nurse conflict checks exist in the original either (those fields
  are free text), so none were added here.
- The fumigation side-effect on the parent theatre (`next_fumigation_due` =
  completion + 7 days, hardcoded) is replicated exactly as a reasonable simple
  business rule, not something worth generalizing into a configurable cadence
  the original never asked for.

**Matched exactly from the original (not a gap, a deliberate choice):**
- `equipment_summary` stays a single free-text field — not worth building an
  equipment join table for what was always a free-text field in the original.
- Team member fields besides the lead surgeon (assistant surgeon, anesthetist,
  scrub nurse, circulating nurse) stay free text, matching the original — there
  is no general hospital Staff table anywhere in this rebuild yet, and building
  one solely for this would be scope creep beyond what was asked.
- Pre-Op checklist stays simple booleans with no timestamp/signoff, and is
  **not** linked to the real Blood Bank cross-match records from Phase 8a even
  though `requires_blood_arrangement`/`pre_op_blood_arranged` exist right next
  to each other — the original never wired this either, and building that
  integration now would be meaningful scope creep beyond a faithful rebuild.
  Same reasoning applied to `requires_icu_booking`: the flag exists and is
  displayed, but nothing acts on it, matching the original exactly.

### ✅ Phase 8e — Radiology / 2D Echo Reports (DONE)
- Studies list: KPI cards (Total/Awaiting Findings/Reported), search by accession number/
  patient/UHID, status filter, cardiac-study marker
- New Study: registered patient OR walk-in name, modality (suggested list, matches
  original), body part/study description, referring doctor (real FK) or free-text
  "referred by", cardiac-study checkbox, optional image upload at creation time
- Study detail: lightweight in-browser viewer (renders PNG/JPG inline; DICOM `.dcm`/
  `.dicom` files offer a download link rather than in-browser parsing — see deviation
  below), multi-file upload, per-file delete, free-text findings entry that marks the
  study Reported on save
- 2D Echo Worklist: cardiac-flagged studies only, pending/completed KPI counts, each
  patient's outstanding invoice balance shown read-only (computed via the same
  `computeInvoiceTotals` helper Billing already uses)
- 2D Echo Report: full structured cardiology template (LVIDd/LVIDs/IVSd/PWD/LA diameter/
  aortic root/EF%/FS%/heart rate, per-chamber/valve findings, regional wall motion, color
  Doppler, impression), upsert-on-save, print via the same `window.print()` pattern
  Lab Reports uses

**New tables:** `radiology_studies`, `radiology_images`, `echo_reports`.

**Critical finding that shaped this sub-phase:** unlike Surgery/OT (Phase 8d), this module
*is* real EF-backed persistence in the original — `TenantDbContext` declares
`DbSet<RadiologyStudy>`/`DbSet<EchoReport>`, and `EfFakeDataService` overrides every
Radiology/Echo method with a real query/write (falling back to in-memory only for an
unconfigured demo tenant). So this sub-phase reverse-engineered a genuinely working
schema rather than designing one from scratch.

**Deviations from the original (flagged, not silent):**
- Real `patient_id` FK, replacing the original's nullable `PatientId` plus denormalized
  `PatientName`/`PatientUhid` snapshot strings copied at creation time (which go stale if
  the patient record is later corrected). Walk-in support (no registered patient) is kept,
  matching the original's actual dual-path design — it's a real capability there, not a gap.
- **Added a nullable `booking_id` FK — a genuine gap fix.** The original has zero linkage
  between a radiology study and the Lab booking/billing pipeline: creating a study never
  creates an invoice line, and no radiology price master exists anywhere in the codebase
  (a `TestMaster.cs` comment implies Radiology was expected to conceptually reuse the Lab
  Test Master's `IsVariableCharges` flag, but no actual FK or integration code was ever
  written). This mirrors the Surgery specimen-dispatch pattern from Phase 8d: an optional
  link to a real `bookings` row is available for billing, instead of leaving radiology
  financially disconnected the way the original left it.
- `reported_by_user_id` is a real FK to `users`; the original stored `ReportedBy` as a
  plain session display-name string with no durable link back to the actual account (if
  that user is later renamed or deleted, the original's report loses attribution).
- **Added `is_cardiac_study` as a real stored flag — fixes a fragile pattern.** The
  original's `GetEchoWorklist()` identified "echo" studies purely by substring-matching the
  free-text `BodyPart` field against a hardcoded keyword list
  (`{"echo","doppler","cardiac","2d echo","color doppler"}`) — a typo or unusual phrasing
  silently excluded a study from the cardiology worklist with no error or warning. The
  New Study form still nudges users the same way the original's UI did (pre-checking the
  box when arriving from the Echo worklist), but the flag itself is real structured data,
  not re-derived by string matching on every worklist load.
- **Added a full `radiology.*` permission module** (`view`/`create`/`upload`/`delete`/
  `report`) and applied it to every route. Both `RadiologyController` and `EchoController`
  in the original have zero `[RequirePermission]` attributes anywhere — the same systemic
  gap as Surgery/Pharmacy, arguably worse here since it also permits unrestricted deletion
  of uploaded patient imaging files from disk with no guard at all.
- The DICOM viewer is intentionally simplified from the original's canvas-based daikon.js
  renderer (window/level sliders, zoom/rotate, uncalibrated pixel-distance measurement) to
  a plain inline `<img>` preview for PNG/JPG plus a download link for `.dcm`/`.dicom`
  files. The original explicitly and repeatedly self-documents this viewer as **not a
  PACS** (no DICOMweb/WADO-RS, no server-side parsing, no calibrated measurement, no
  annotations) — replicating a heavyweight uncalibrated client-side DICOM parser wasn't
  requested and would be a large surface area for something the original itself treats as
  a lightweight bonus feature, not a core requirement.

**Matched exactly from the original (not a gap, a deliberate choice):**
- Modality stays a free-text field with a UI-suggested list (X-Ray/CT Scan/MRI/
  Ultrasound/Mammography/Other), not a rigid enum or lookup table — real-world modality
  naming varies too much to force into a fixed lookup the original never had either.
- Structured report template exists **only for Echo/2D Doppler**, matching the original's
  actual scope exactly. Every other modality (X-Ray, CT, MRI, plain USG, Mammography)
  still gets just one free-text findings field — the original never built structured
  templates for those (confirmed via `PENDING.md` item #24, which describes Echo as
  "layered on the existing `RadiologyStudy` infrastructure" specifically because the lab
  offers cardiology services, not as a general template system), so inventing per-modality
  templates now would be scope creep beyond a faithful rebuild.
- Single-step "save findings = Reported" workflow, no separate verify-then-approve gate —
  matches the original exactly (contrast with this rebuild's own Phase 5 Lab Reports
  verify → approve flow, which Radiology never had in the original and wasn't asked for
  here either).
- No equipment/machine master (X-Ray/USG/CT/MRI scanner resource) — the original never
  modeled one for Radiology, unlike Operation Theatres in Surgery/OT; not adding one here.
- Two-state status only (`Uploaded` → `Reported`), no richer Pending/In-Progress queue —
  matches the original exactly.

### ✅ Phase 8f — Notifications (Email/SMS/WhatsApp), Machine Integration (DONE)
This is the last sub-phase of Phase 8 — Advanced Features is now fully complete (8a–8f).

**Notifications:**
- Notification Center: KPI cards (Templates/Sent/Failed/Total Log), template CRUD across
  all 3 channels (Email/SMS/WhatsApp) for all 10 trigger events, "Send Test Notification"
  ad-hoc form, delivery log with status/reference
- Bulk SMS Sender: send to an individual number, all patients, or all employees, with an
  optional "Dear [Name]," prefix
- Blood Bank dashboard gained a "Send Alert Notifications" button (mirrors the original's
  manual trigger exactly: checks 5 live conditions — low stock, expiring units, emergency
  requests, pending cross-match, out-of-range storage — and notifies active Blood Bank
  Manager users, with a same-day de-duplication guard)
- All sends remain **simulated and logged only** — no real SMTP/SMS/WhatsApp provider is
  called, matching the original exactly (see deviations below for why this wasn't changed)

**Machine Integration:**
- Connections board: KPI cards (Machines Registered/Connected/Connection Errors/Results
  Received Today), add-machine form (name/department/protocol label/IP address), status
  toggle (Connected/Disconnected/Error) with an auto-logged sync log entry per change and
  `last_sync_on` stamping — replicated exactly from the original
- Per-machine sync log viewer (expandable row)

**New tables:** `notification_templates`, `notification_log_entries`,
`machine_connections`, `machine_sync_log_entries`.

**Critical scoping context:** both halves of this sub-phase ARE real EF-backed persistence
in the original (unlike Surgery/OT) — `TenantDbContext` declares real `DbSet<T>`s for all
four entities and `EfFakeDataService` overrides every method with a real query/write. So
the schemas above are genuine reverse-engineering, not from-scratch design. What differs
sharply between the two halves is how much of the *business logic* is real vs. aspirational
— see the deviations below.

**Deviations from the original (flagged, not silent) — Notifications:**
- **Wired all 10 trigger events to real call sites; the original only wired 5.** Of the
  original's 10 declared trigger events, only the 5 Blood Bank alerts ever actually fired
  anywhere in the codebase (and only via a manual dashboard button, never a scheduler).
  The other 5 — Booking Confirmed, Sample Collected, Report Ready, Payment Received,
  Invoice Due — had seeded template text but zero trigger code calling `SendNotification`
  in `BookingController`/report-verify/`BillingController` anywhere; they were permanently
  dead. This rebuild wires all 5 into their real call sites: booking creation (Booking
  Confirmed), booking status → Collected (Sample Collected), report approval (Report
  Ready), invoice creation and payment recording (Payment Received), and invoice creation
  when a credit-sale balance remains (Invoice Due, fired once at creation time rather than
  via a scheduler — see below). This is the same class of fix as Phase 8d's Surgery
  specimen dispatch: completing a data model that already implied the behavior should
  exist, rather than leaving 5 of 10 trigger events as permanent dead code.
- `recipient_user_id` is a real nullable FK to `users` (for internal-staff sends like Blood
  Bank alerts); the original only stored a free-text `Recipient` string with no link back
  to the notified account.
- Template editing is exposed via a real `PUT` route. The original's
  `UpdateNotificationTemplate` service method exists but has no controller action ever
  calling it — templates could only be created or deleted from its UI. This rebuild treats
  that as a trivial, safe CRUD completion rather than a business-logic gap worth leaving
  broken (unlike the deliberate business-logic changes above, this one carries no scope
  judgment call).
- Added a full `notifications.*` permission module (`view`/`create`/`edit`/`delete`/
  `send`). The original's `NotificationsController` had zero `[RequirePermission]`
  attributes anywhere — the same systemic gap found in every other Phase 8 module.

**Matched as-is from the original (not gaps, deliberate choices) — Notifications:**
- **No real Email/SMS/WhatsApp provider integration.** The original's own code comments
  state explicitly: *"No real Email/SMS/WhatsApp provider is wired up in this demo;
  sending records the attempt so the flow can be reviewed."* Building an actual SMTP
  client / Twilio-or-MSG91-style SMS gateway call / WhatsApp Business API integration is a
  distinct, materially larger scope decision — it involves real external credentials,
  costs, and delivery guarantees that were never part of a faithful rebuild request. Every
  send here is still simulated and logged, exactly like the original.
- **No scheduler/background job.** Invoice Due fires once at invoice-creation time (when a
  credit-sale balance remains) rather than via a recurring reminder job, because the
  original never had a scheduler for anything either — every original trigger (including
  the 5 real Blood Bank ones) was manually button-triggered, never time-based. Introducing
  a cron-style job here would be new infrastructure the original never had.
- `{Count}`/`{LabName}` placeholder substitution for Blood Bank alerts, and the "already
  sent today" de-duplication guard, are replicated exactly.

**Deviations from the original (flagged) — Machine Integration:**
- Added a full `machines.*` permission module (`view`/`create`/`edit`). The original's
  `MachineIntegrationController` had zero `[RequirePermission]` attributes, the same
  systemic gap as everywhere else.

**Matched as-is in full from the original — Machine Integration (this is intentional, not
an oversight):** the original's own code comments state plainly, twice — on the controller
and on the entity — *"Real HL7/ASTM interfacing is out of scope for the demo; this models
the operational monitoring view lab staff would use day to day."* Concretely, there is
**no protocol implementation to port** (no HL7 parser, no ASTM frame handler, no TCP
listener, no serial port reader anywhere in the original), **no result-mapping schema**
(no entity anywhere associates an instrument field/channel with a specific
Analyte/Test), and **no connection to Lab Reports** (`report_results` is never
touched by anything in the original's machine-integration code — connecting a machine
only flips its own status and stamps `last_sync_on`). This rebuild deliberately keeps all
of that out of scope too: `protocol` stays a free-text/suggested-list field, `results_today`
stays a plain counter not derived from any parsed message, and connecting/disconnecting a
machine only affects its own status + sync log. Building a real instrument integration
(HL7/ASTM parsing, TCP/serial handling, automatic result-to-analyte mapping feeding into
`report_results`) would be substantial new engineering with no original implementation to
reverse-engineer — a legitimate feature someone could request, but a deliberate scope
decision rather than a "gap fix," so it was not built here without being asked for.



## ✅ Phase 9 — Administration & Enterprise (DONE)
This phase is split into two sub-phases, mirroring the Phase 8 pattern. Both are complete:

### ✅ Phase 9a — Employee Management & Payroll (DONE)
- Employees: HR master record (personal/contact/bank/PF-ESI details, designation, free-text
  department, optional linked branch, optional linked system-login user), card-grid list
  with search/status filter and KPIs (Total/Active/On Leave/Monthly Payroll), status
  transitions (Active/On Leave/Resigned/Terminated)
- Designation Master: simple CRUD, blocked from deletion while assigned to an employee
- Attendance: date-scoped daily marking (Present/Absent/Half Day/On Leave) per active
  employee
- Leave Requests: raise/approve/reject
- Salary Heads: configurable Earning/Deduction heads, Fixed amount or Percent-of-Basic with
  an optional PF-style basic-salary cap
- Employee Advances: Dr (advance given) / Cr (repayment) ledger per employee with a running
  balance
- Salary Payments: per-employee monthly run with a live calculation preview (resolves
  active salary heads against the employee's basic salary before saving), attendance-based
  proration (basic salary ÷ working days × paid-for days), TDS %, advance deduction,
  approve/reject/cancel workflow, printable payslip
- Salary Register: month-wise summary report across all employees with earnings/
  deductions/payable totals, printable
- Employee Wallets: simple per-employee cash wallet with opening-balance entries and
  transfer-between-wallets (initiate → accept/reject/cancel)

**New tables:** `designation_masters`, `employees`, `attendance_records`,
`leave_requests`, `salary_heads`, `employee_advances`, `salary_payments`,
`salary_payment_lines`, `employee_wallets`, `wallet_opening_entries`,
`wallet_transfer_entries`.

**Critical scoping context:** both Employee and Payroll ARE real EF-backed persistence in
the original (`TenantDbContext` declares real `DbSet<Employee>`/`DbSet<SalaryPayment>`/etc.,
`EfFakeDataService` overrides every method with a real query/write) — so this sub-phase
reverse-engineered a genuinely working schema, not a from-scratch design.

**Deviations from the original (flagged, not silent):**
- **Payroll now runs directly off `employees` via a real `employee_id` FK — a genuine gap
  fix.** In the original, `Employee` is a deliberately separate HR-only record (can exist
  with no system login at all), but `SalaryPayment`/`EmployeeAdvance`/`UserWallet` all key
  off `AppUser.Id` instead, with the Employee↔Payroll link resolved only by fuzzy string-
  matching (`LinkedUserName`/`FullName` equality) at display time in
  `PayrollController.Payslip`. This was a real seam, not a deliberate design choice — an
  employee's payroll history could silently fail to display if names didn't match exactly,
  and an employee with no system login couldn't be paid through the original's Payroll
  module at all despite being a legitimate HR record. Here, every payroll table has a hard
  FK to `employees`; `linked_user_id` remains as a nullable FK to `users` matching the
  original's optional system-login link, but it's no longer the join key anything depends
  on.
- Added full `hr.*`/`payroll.*` permission modules and applied them to every route. The
  original's `EmployeeController`/`PayrollController` had zero `[RequirePermission]`
  attributes anywhere — the same systemic gap found in every module ported so far.

**Matched as-is from the original (not gaps, deliberate choices):**
- `department` stays free text on `employees`, not a master table — the original's own
  code comment explicitly states this was "deliberately not a separate master to keep this
  addition scoped," a real, stated design choice worth respecting rather than overriding
  with an unrequested master table.
- Salary heads stay configurable (Fixed or Percent-of-Basic with an optional PF-style cap)
  rather than a fixed CTC breakdown, matching `SalaryHead.Calculate(basicSalary)` exactly.
- PF/ESI/professional tax stay modeled as ordinary salary heads identified by name, not
  strongly-typed columns — matches the original, which never gave PF/ESI first-class
  fields either; only TDS gets a dedicated percent field, exactly as in the original.
- The payroll run stays manual/per-employee — the original has no batch "run payroll for
  everyone this month" action, and none was added here.
- Attendance/Leave stay disconnected from the payroll run, matching the original exactly:
  `SalaryPayment`'s day-counts (`working_days`/`absent_days`/`leave_days`/`paid_for_days`)
  are entered manually on the salary-payment form, not auto-pulled from
  `attendance_records`/`leave_requests` (those feed a separate HR view in the original,
  not the payroll calculation). Proration itself is real and replicated exactly; only the
  day-counts feeding it are operator-entered rather than system-derived.

### ✅ Phase 9b — Accounting, Multi-Company & Financial Year, Database Backup (DONE)
This completes Phase 9 — Administration & Enterprise (both 9a and 9b are now done).

- Chart of Accounts: Account Groups (Assets/Liabilities/Income/Expense/Capital, with a
  Cash/Bank/Purchase/Sale tag) and Ledger Accounts (per-FY opening balance, party fields —
  GSTIN/contact/credit terms — for supplier/customer-style accounts)
- Vouchers: real double-entry (Payment/Receipt/Journal/Contra), server-validated balanced
  (Σ Debit = Σ Credit, minimum 2 lines), rejected outright if the current financial year is
  locked, printable voucher detail
- Ledger Statement: running-balance walk per account starting from its opening balance,
  date-range filter, printable
- Daily Ledger: every voucher line posted on a given date, across all accounts
- Bill-wise Outstanding: open "Against Bill"/"New Reference" voucher lines not yet settled
- Expenses: simple non-double-entry "pay this expense head this amount" records, separate
  from Vouchers (matches the original — this is the deliberately lighter-weight path for
  day-to-day expense entry vs. a full journal voucher)
- Bank Reconciliation: bank accounts linked to a Bank-type ledger account, manual statement
  entry (header + transaction rows), manual match-to-invoice/payment, and a real Auto-Match
  algorithm (day-tolerance amount matching against unmatched payments), reconciliation
  summary report (matched/unmatched counts and amount)
- Opening Balances: per financial year, for Patients, Doctors, Suppliers, and Ledger
  Accounts (Inventory opening balances also modeled in the schema, exposed via the same
  route pattern)
- Companies & Financial Years: multiple legal-entity/GSTIN "Companies" per hospital tenant
  (distinct from Branch), each with its own Financial Years (create, set-current, and a
  real lock/unlock that rejects further voucher postings once locked), branches assignable
  to a company
- Database Backup & Export: one-click `pg_dump`-based backup (listed, downloadable,
  deletable), full-data JSON export, and per-table CSV export (Patients/Bookings/Invoices/
  Tests/Blood Units) — all gated behind a new `backup.*` permission

**New tables:** `companies`, `financial_years` (plus a new `company_id` FK added to the
existing `branches` table), `account_groups`, `ledger_accounts`, `vouchers`,
`voucher_lines`, `expenses`, `bank_accounts`, `bank_statements`, `bank_transactions`,
`reconciliation_matches`, `patient_opening_balances`, `doctor_opening_balances`,
`supplier_opening_balances`, `inventory_opening_balances`, `account_opening_balances`.

**Critical scoping context:** all of this IS real EF-backed persistence in the original —
`TenantDbContext` declares real `DbSet<AccountGroup>`/`DbSet<LedgerAccount>`/
`DbSet<Voucher>`/`DbSet<BankAccount>`/`DbSet<ReconciliationMatch>`/`DbSet<Company>`/
`DbSet<FinancialYear>`/etc., and `EfFakeDataService` overrides every method with a real
query/write. So this sub-phase reverse-engineered genuinely working schemas, not a
from-scratch design.

**Deviations from the original (flagged, not silent):**
- **Added a real `company_id` FK on `branches` — a genuine gap fix.** The original has NO
  link between `Branch` (a physical location under one firm) and `Company` (a separate
  legal entity/GSTIN) at all — the two are entirely parallel hierarchies under the same
  tenant with no relationship between them. In a real multi-company hospital group, every
  physical branch legally belongs to exactly one company; leaving that unmodeled was a real
  gap, not a defended design choice (unlike e.g. "Department stays free text," which the
  original explicitly justified in code comments — nothing defends this omission the same
  way). The demo seed links every existing branch to the tenant's one default company so
  the column is meaningfully populated from day one, with a dedicated route to reassign a
  branch to a different company.
- **Added a full `accounting.*`/`company.*`/`backup.*` permission module and applied it to
  every route.** `AccountingController`/`BankReconciliationController`/
  `OpeningBalanceController`/`CompanyController` all had zero `[RequirePermission]`
  attributes anywhere — the same systemic gap found in every module ported so far.
- **Added a permission guard on Database Backup specifically as a deliberate security
  fix, not a faithful port.** The original's real backup utility
  (`AdminController`/`DatabaseBackupService`) had zero permission checks — any
  authenticated user could trigger a full database backup or export all patient/financial
  data, arguably the highest-risk finding across this entire phase's research. Rather than
  copy that gap forward, `backup.*` permissions are required here, consistent with this
  rebuild's standing practice of treating "every module has zero permission checks" as a
  bug to fix, not a behavior to replicate.
- **Database backup uses `pg_dump` shelled out as an external process** — the direct
  Postgres equivalent of the original's in-process `BACKUP DATABASE ... TO DISK` T-SQL
  command against SQL Server. This is a necessary adaptation, not a scope choice: Postgres
  has no in-process "backup to disk" SQL command the way SQL Server does, and `pg_dump`
  running as an external process is the standard, correct way to do this. Requires
  PostgreSQL client tools to be installed and on the server's `PATH`; surfaces a clear
  error if `pg_dump` isn't found rather than failing silently.
- The original's separate, purely decorative *simulated* backup path
  (`EnterpriseController.System`/`RunBackup`/`BackupRecord`) was **not ported** — only the
  real `AdminController` backup utility was, since the simulated one had no actual
  database operation behind it and would just be dead weight here.

**Matched as-is from the original (not gaps, deliberate choices):**
- **Billing and Accounting stay fully disconnected.** The original never auto-posts a
  `Voucher` when an `Invoice`/`Payment` is created anywhere in `BillingController` —
  vouchers are always entered manually via `AccountingController.VoucherCreate`. Building
  an automatic invoice-to-journal-entry posting engine would be significant new scope
  (requiring a whole new "which ledger account does an invoice line map to" rules layer)
  that was never part of the original and wasn't requested here either.
- **Bank statement "import" stays manual line-by-line entry, not real file parsing.** No
  CSV/OFX/MT940 parser exists anywhere in the original to port. Auto-Match itself is real
  (day-tolerance amount matching against existing payments) and is replicated exactly —
  only the step of getting transaction rows onto the statement in the first place is still
  a manual keying step, matching the original.
- No unified GSTR-style report ties Accounting and Billing GST together — the original
  never built one; GST fields on `ledger_accounts` (party GSTIN) and Billing's own invoice
  GST fields (Phase 6) remain separate, as in the original. The original's Tally
  Prime/ERP9 XML voucher export was also not ported — a standalone integration feature
  with no dependency from the rest of Accounting, out of scope for this pass.
- `BackdatePermission` (per-user, per-company, per-module max-backdate-days grants) was
  **not ported** — a minor, low-usage feature in the original with no dependents elsewhere
  in the schema; can be added later if actually needed.

## Phase 10 — Enterprise / Platform Features
- Multi-tenant hospital provisioning (platform-level `hospitals` admin, already
  partially modeled in the `hospitals` table from Phase 1)
- Subscription plans & billing
- AI report summary, OCR prescription reading (future scope, matches original's
  "Future Ready" section — not committed to a specific implementation yet)

---

## Working conventions for future phases
- Backend: one `*.routes.js` file per module under `backend/src/routes/`, mounted
  in `backend/src/app.js`. Use `requireAuth` + `requirePermission('module.action')`
  on every route, matching the permission codes in `src/config/permissions.js`.
- Every table carries a `hospital_id` column (single-DB multi-tenant model) — always
  filter/scope queries by the authenticated user's `hospitalId` claim.
- Frontend: one folder per module under `frontend/src/pages/<module>/`, add the
  route to `App.jsx`, and un-mark the corresponding sidebar item in
  `frontend/src/config/navigation.js` (remove `comingSoon: true`).
- Keep reusing the existing design system (`src/styles/*.css` — `lsp-panel`,
  `kpi-card`, `status-pill`, `lsp-table`, `btn`, `form-control`, etc.) rather than
  introducing new component styles, to preserve visual parity with the original app.
