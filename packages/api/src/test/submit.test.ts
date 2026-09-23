/**
 * Unit tests for the burn submit validation pipeline.
 * Pure functions only — zero network, zero database.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, validateSubmit } from '../lib/validate';

describe('normalizeDomain', () => {
  it('strips scheme, www, path, port, and case', () => {
    assert.equal(normalizeDomain('https://WWW.Example.com/pricing?x=1'), 'example.com');
    assert.equal(normalizeDomain('http://app.example.io:8080/a/b#c'), 'app.example.io');
    assert.equal(normalizeDomain('  Example.lol  '), 'example.lol');
  });

  it('accepts multi-level subdomains', () => {
    assert.equal(normalizeDomain('a.b.c.example.co.uk'), 'a.b.c.example.co.uk');
  });

  it('rejects garbage, IPs, and localhost', () => {
    assert.equal(normalizeDomain('not a domain'), null);
    assert.equal(normalizeDomain('example'), null); // no TLD
    assert.equal(normalizeDomain('http://localhost:3000'), null);
    assert.equal(normalizeDomain('127.0.0.1'), null);
    assert.equal(normalizeDomain(''), null);
    assert.equal(normalizeDomain(null), null);
    assert.equal(normalizeDomain('-bad-.com'), null);
  });
});

describe('validateSubmit', () => {
  const valid = {
    name: 'StealthMode AI',
    domain: 'https://stealthmode.lol/',
    monthlyBurn: '42000',
    runwayMonths: 3,
    headcount: '12',
    fundingRaised: '2000000',
    email: 'FOUNDER@Stealthmode.lol',
  };

  it('accepts a valid payload and normalizes it', () => {
    const r = validateSubmit(valid);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.domain, 'stealthmode.lol');
    assert.equal(r.data.email, 'founder@stealthmode.lol');
    assert.equal(r.data.monthlyBurn, 42000);
    assert.equal(r.data.headcount, 12);
  });

  it('treats optional fields as null when blank', () => {
    const r = validateSubmit({ ...valid, headcount: '', fundingRaised: undefined });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.headcount, null);
    assert.equal(r.data.fundingRaised, null);
  });

  it('rejects empty name, zero burn, negative runway, bad email', () => {
    const r = validateSubmit({
      ...valid,
      name: '  ',
      monthlyBurn: 0,
      runwayMonths: -1,
      email: 'nope',
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.ok(r.fields.name);
    assert.ok(r.fields.monthlyBurn);
    assert.ok(r.fields.runwayMonths);
    assert.ok(r.fields.email);
  });

  it('rejects absurd values past the caps', () => {
    const r = validateSubmit({
      ...valid,
      monthlyBurn: 999_999_999_999,
      runwayMonths: 9999,
      headcount: 2.5,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.ok(r.fields.monthlyBurn);
    assert.ok(r.fields.runwayMonths);
    assert.ok(r.fields.headcount);
  });

  it('parses $ and comma formatted money strings', () => {
    const r = validateSubmit({ ...valid, monthlyBurn: '$42,000.50' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.monthlyBurn, 42000.5);
  });
});
