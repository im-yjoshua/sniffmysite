/**
 * Unit tests for company-page helpers (slug scheme + runway math).
 * Pure functions only — zero network, zero database.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugifyDomain, runwayEndsAt, runwayDaysRemaining, DAYS_PER_MONTH } from '../lib/company';

describe('slugifyDomain', () => {
  it('takes the first DNS label, lowercased', () => {
    assert.equal(slugifyDomain('stealthmode.lol'), 'stealthmode');
    assert.equal(slugifyDomain('PromptFi.IO'), 'promptfi');
    assert.equal(slugifyDomain('app.example.co.uk'), 'app');
  });
});

describe('runwayEndsAt', () => {
  it('adds runway months at 365.25/12 days each', () => {
    const listed = new Date('2026-01-01T00:00:00Z');
    const end = runwayEndsAt(listed, 1)!;
    assert.equal(end.getTime(), listed.getTime() + DAYS_PER_MONTH * 86_400_000);
  });

  it('handles fractional months', () => {
    const listed = new Date('2026-01-01T00:00:00Z');
    const end = runwayEndsAt(listed, 0.5)!;
    assert.equal(end.getTime(), listed.getTime() + 0.5 * DAYS_PER_MONTH * 86_400_000);
  });

  it('returns null for unknown runway or bad dates', () => {
    assert.equal(runwayEndsAt(new Date(), null), null);
    assert.equal(runwayEndsAt('not-a-date', 3), null);
  });
});

describe('runwayDaysRemaining', () => {
  it('counts down toward the end date', () => {
    const listed = new Date('2026-09-01T00:00:00Z');
    const now = new Date('2026-09-11T00:00:00Z'); // 10 days later
    const remaining = runwayDaysRemaining(listed, 0.5, now)!; // 0.5mo ≈ 15.22d
    assert.ok(Math.abs(remaining - (0.5 * DAYS_PER_MONTH - 10)) < 1e-9);
  });

  it('goes negative once airborne', () => {
    const listed = new Date('2026-01-01T00:00:00Z');
    const remaining = runwayDaysRemaining(listed, 0, new Date('2026-02-01T00:00:00Z'))!;
    assert.ok(remaining < 0);
  });

  it('returns null when runway is unknown', () => {
    assert.equal(runwayDaysRemaining(new Date(), null), null);
  });
});
