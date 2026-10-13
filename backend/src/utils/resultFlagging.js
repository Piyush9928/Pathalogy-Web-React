/**
 * Auto-flag and reference-range resolution for lab result entry.
 *
 * Deviation from the original app: the original used a relative-multiplier heuristic
 * (Critical if value < low*0.6 or > high*1.6) and never actually consulted
 * AnalyteMaster.CriticalLow/CriticalHigh despite those fields existing. Here we use the
 * real critical thresholds when present, which is clinically more accurate.
 *
 * Also fixes a bug in the original: reference-band gender matching compared against the
 * literal string "Both", which never matched actual band values ("All"/"Male"/"Female"/
 * "Child"), so gender-aware ranges silently never applied. Here gender/age are matched
 * correctly against the patient's actual gender and age.
 */

/** Picks the best-matching reference band for a patient's gender/age, or null. */
function pickReferenceBand(bands, gender, age) {
  if (!bands || bands.length === 0) return null;

  const ageNum = Number(age);
  const genderMatches = (b) => b.gender === gender || b.gender === 'All';
  const ageMatches = (b) => Number.isNaN(ageNum) || (ageNum >= b.age_min && ageNum <= b.age_max);

  // Prefer an exact gender match with age in range, then any gender="All" with age in range,
  // then fall back to the first band regardless of age/gender.
  return (
    bands.find((b) => b.gender === gender && ageMatches(b)) ||
    bands.find((b) => b.gender === 'All' && ageMatches(b)) ||
    bands.find(genderMatches) ||
    bands[0]
  );
}

/** Parses a "low-high" style range string, e.g. "13.0 - 17.0" or "13.0-17.0". Returns {low, high} or null. */
function parseRangeString(rangeStr) {
  if (!rangeStr) return null;
  const match = String(rangeStr).match(/(-?\d+(\.\d+)?)\s*-\s*(-?\d+(\.\d+)?)/);
  if (!match) return null;
  return { low: parseFloat(match[1]), high: parseFloat(match[3]) };
}

/**
 * Determines the flag (Normal/Low/High/Critical) for a numeric value given optional
 * critical thresholds and a low/high normal range. Falls back to "Normal" if the value
 * isn't numeric or no range is available (e.g. text/dropdown analyte results).
 */
function computeFlag(value, { criticalLow, criticalHigh, low, high } = {}) {
  const numeric = parseFloat(value);
  if (Number.isNaN(numeric)) return 'Normal';

  if (criticalLow != null && numeric < Number(criticalLow)) return 'Critical';
  if (criticalHigh != null && numeric > Number(criticalHigh)) return 'Critical';

  if (low != null && high != null) {
    if (numeric < low) return 'Low';
    if (numeric > high) return 'High';
  }

  return 'Normal';
}

/**
 * Resolves the display reference-range string, unit, and critical thresholds for an
 * analyte given the patient's gender/age - used both to auto-populate the result-entry
 * form and to compute the flag server-side on save.
 */
function resolveAnalyteRange(analyte, referenceBands, gender, age) {
  const band = pickReferenceBand(referenceBands, gender, age);
  const rangeDisplay = band ? `${band.low} - ${band.high}` : analyte.reference_range || '';
  const parsed = band ? { low: parseFloat(band.low), high: parseFloat(band.high) } : parseRangeString(analyte.reference_range);

  return {
    unit: analyte.unit || '',
    referenceRange: rangeDisplay,
    low: parsed?.low ?? null,
    high: parsed?.high ?? null,
    criticalLow: analyte.critical_low,
    criticalHigh: analyte.critical_high,
  };
}

module.exports = { pickReferenceBand, parseRangeString, computeFlag, resolveAnalyteRange };
