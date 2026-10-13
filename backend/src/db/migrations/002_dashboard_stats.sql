-- Dashboard support table - a simple mutable snapshot row per hospital, mirrors Entities/DashboardStats.cs.
-- Kept simple for Phase 1; later phases will replace this with real aggregation queries over
-- patients/bookings/invoices/reports tables as those are introduced.

CREATE TABLE IF NOT EXISTS dashboard_stats (
    hospital_id                 INTEGER PRIMARY KEY REFERENCES hospitals(id) ON DELETE CASCADE,
    patients_today               INTEGER NOT NULL DEFAULT 0,
    patients_trend                NUMERIC(5,2) NOT NULL DEFAULT 0,
    revenue_today                 NUMERIC(14,2) NOT NULL DEFAULT 0,
    revenue_trend                 NUMERIC(5,2) NOT NULL DEFAULT 0,
    outstanding_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
    outstanding_invoices          INTEGER NOT NULL DEFAULT 0,
    reports_pending                INTEGER NOT NULL DEFAULT 0,
    pending_trend                  NUMERIC(5,2) NOT NULL DEFAULT 0,
    average_turnaround_hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
    reports_completed              INTEGER NOT NULL DEFAULT 0,
    reports_completed_trend        NUMERIC(5,2) NOT NULL DEFAULT 0,
    samples_in_process             INTEGER NOT NULL DEFAULT 0,
    home_collections_today         INTEGER NOT NULL DEFAULT 0,
    critical_reports               INTEGER NOT NULL DEFAULT 0,
    revenue_trend_labels           JSONB NOT NULL DEFAULT '[]',
    revenue_trend_values           JSONB NOT NULL DEFAULT '[]',
    booking_source_labels          JSONB NOT NULL DEFAULT '[]',
    booking_source_values          JSONB NOT NULL DEFAULT '[]',
    top_tests_labels               JSONB NOT NULL DEFAULT '[]',
    top_tests_values               JSONB NOT NULL DEFAULT '[]',
    department_loads               JSONB NOT NULL DEFAULT '[]', -- [{name, count, percent, tone}]
    recent_activity                JSONB NOT NULL DEFAULT '[]', -- [{tone, icon, text, meta}]
    updated_on                     TIMESTAMP NOT NULL DEFAULT NOW()
);
