/**
 * Unit tests for the Turnstile-gated scan budget (lib/scan-budget.ts).
 *
 * The model: 30 free scans per rolling hour per IP; each verified Turnstile
 * solve grants +10 scans in the same window; grants stack (30 + 10k).
 * Time is injected so window rollover is deterministic.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCAN_FREE_LIMIT,
  SCAN_GRANT_SIZE,
  SCAN_WINDOW_MS,
  scanAllowance,
  recordScan,
  recordGrant,
  _resetScanBudgets,
} from '../lib/scan-budget';

const IP = '203.0.113.7';
const T0 = 1_700_000_000_000;

beforeEach(() => _resetScanBudgets());

describe('scan budget math', () => {
  it('a fresh IP gets 30 free scans', () => {
    assert.deepEqual(scanAllowance(IP, T0), { used: 0, limit: SCAN_FREE_LIMIT });
    assert.equal(SCAN_FREE_LIMIT, 30);
  });

  it('30 scans exhaust the free budget; the 31st is over', () => {
    for (let i = 0; i < 30; i++) recordScan(IP, T0 + i * 1000);
    const { used, limit } = scanAllowance(IP, T0 + 30_000);
    assert.equal(used, 30);
    assert.equal(limit, 30);
    assert.ok(used >= limit, '31st scan would be over budget');
  });

  it('one grant adds 10 scans of headroom', () => {
    for (let i = 0; i < 30; i++) recordScan(IP, T0 + i * 1000);
    recordGrant(IP, T0 + 31_000);
    const { used, limit } = scanAllowance(IP, T0 + 32_000);
    assert.equal(used, 30);
    assert.equal(limit, 40);
    assert.equal(SCAN_GRANT_SIZE, 10);
  });

  it('grants stack: 30 + 10k', () => {
    recordGrant(IP, T0);
    recordGrant(IP, T0 + 1000);
    assert.equal(scanAllowance(IP, T0 + 2000).limit, 50);
  });

  it('scans past the granted headroom go over budget again', () => {
    recordGrant(IP, T0);
    for (let i = 0; i < 40; i++) recordScan(IP, T0 + i * 1000);
    const { used, limit } = scanAllowance(IP, T0 + 41_000);
    assert.equal(used, 40);
    assert.equal(limit, 40);
    assert.ok(used >= limit, '41st scan needs another solve');
  });

  it('the window rolls: old scans and grants fall out after an hour', () => {
    for (let i = 0; i < 30; i++) recordScan(IP, T0 + i * 1000);
    recordGrant(IP, T0 + 31_000);
    const later = T0 + SCAN_WINDOW_MS + 60_000;
    assert.deepEqual(scanAllowance(IP, later), { used: 0, limit: 30 });
  });

  it('budgets are per-IP: one IP spending does not touch another', () => {
    for (let i = 0; i < 30; i++) recordScan(IP, T0 + i * 1000);
    assert.deepEqual(scanAllowance('198.51.100.9', T0 + 31_000), {
      used: 0,
      limit: 30,
    });
  });
});
