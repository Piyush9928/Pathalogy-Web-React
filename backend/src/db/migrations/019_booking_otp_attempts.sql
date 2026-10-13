-- Home-collection OTP is a 4-digit code, so it must be attempt-limited or it can be guessed in 10,000 tries.
-- Idempotent: migrate.js re-runs every file.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;
