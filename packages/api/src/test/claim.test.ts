import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  newClaimToken,
  hashToken,
  claimExpired,
  normalizeClaimEmail,
  sanitizeClaimId,
  dnsChallengeToken,
  dnsRecordValue,
  findMatchingTxt,
  DNS_RECORD_PREFIX,
  CLAIM_TTL_MS,
} from '../lib/claim.js';

describe('newClaimToken', () => {
  it('mints a 64-hex-char public token and stores only its sha256', () => {
    const { publicToken, tokenHash } = newClaimToken();
    assert.match(publicToken, /^[0-9a-f]{64}$/);
    assert.equal(tokenHash, hashToken(publicToken));
    assert.equal(tokenHash.length, 64);
    assert.notEqual(publicToken, tokenHash);
  });

  it('mints unique tokens', () => {
    const a = newClaimToken().publicToken;
    const b = newClaimToken().publicToken;
    assert.notEqual(a, b);
  });
});

describe('hashToken', () => {
  it('is deterministic sha256 hex', () => {
    assert.equal(
      hashToken('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('claimExpired', () => {
  it('treats missing/unparseable/past expiries as expired', () => {
    assert.equal(claimExpired(null), true);
    assert.equal(claimExpired(undefined), true);
    assert.equal(claimExpired('not-a-date'), true);
    assert.equal(claimExpired(new Date(Date.now() - 1000).toISOString()), true);
  });

  it('treats a fresh 24h expiry as alive', () => {
    assert.equal(CLAIM_TTL_MS, 24 * 60 * 60 * 1000);
    assert.equal(claimExpired(new Date(Date.now() + CLAIM_TTL_MS).toISOString()), false);
  });
});

describe('normalizeClaimEmail', () => {
  it('lowercases and trims valid emails', () => {
    assert.equal(normalizeClaimEmail('  Founder@StealthMode.LOL '), 'founder@stealthmode.lol');
  });

  it('rejects garbage', () => {
    assert.equal(normalizeClaimEmail('nope'), null);
    assert.equal(normalizeClaimEmail('a@b'), null);
    assert.equal(normalizeClaimEmail(''), null);
    assert.equal(normalizeClaimEmail(null), null);
    assert.equal(normalizeClaimEmail(42), null);
  });
});

describe('sanitizeClaimId', () => {
  it('accepts UUID-shaped ids, rejects the rest', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    assert.equal(sanitizeClaimId(id), id);
    assert.equal(sanitizeClaimId(id.toUpperCase()), id);
    assert.equal(sanitizeClaimId('not-a-uuid'), null);
    assert.equal(sanitizeClaimId('../../etc/passwd'), null);
  });
});

describe('dns challenge', () => {
  const secret = 'test-secret-with-enough-length';

  it('is deterministic per claim id and distinct across claims', () => {
    const a = '123e4567-e89b-12d3-a456-426614174000';
    const b = '123e4567-e89b-12d3-a456-426614174001';
    assert.equal(dnsChallengeToken(a, secret), dnsChallengeToken(a, secret));
    assert.notEqual(dnsChallengeToken(a, secret), dnsChallengeToken(b, secret));
    assert.match(dnsChallengeToken(a, secret), /^[0-9a-f]{64}$/);
  });

  it('builds the exact TXT record value', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    assert.equal(
      dnsRecordValue(id, secret),
      `${DNS_RECORD_PREFIX}${dnsChallengeToken(id, secret)}`,
    );
  });
});

describe('findMatchingTxt', () => {
  const challenge = 'deadbeef'.repeat(8); // 64 hex chars
  const want = `${DNS_RECORD_PREFIX}${challenge}`;

  it('matches a record split across chunks', () => {
    const records = [['v=spf1 include:_spf.example.com ~all'], [want.slice(0, 20), want.slice(20)]];
    assert.equal(findMatchingTxt(records, challenge), true);
  });

  it('ignores whitespace padding but not smuggled substrings', () => {
    assert.equal(findMatchingTxt([[`  ${want}  `]], challenge), true);
    assert.equal(findMatchingTxt([[`prefix-${want}-suffix`]], challenge), false);
    assert.equal(findMatchingTxt([['unrelated', 'noise']], challenge), false);
    assert.equal(findMatchingTxt([], challenge), false);
  });
});
