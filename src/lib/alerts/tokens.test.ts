// src/lib/alerts/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from './tokens'

const SECRET = 'test-secret-please-rotate'

describe('signToken / verifyToken', () => {
  it('round-trips a valid token', () => {
    const exp = Date.now() + 60_000
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp }, SECRET)
    const p = verifyToken(t, 'confirm', SECRET)
    expect(p?.subjectId).toBe('abc')
    expect(p?.purpose).toBe('confirm')
  })
  it('rejects a tampered body', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ purpose: 'confirm', subjectId: 'evil', exp: Date.now() + 60_000 })).toString('base64url')
    expect(verifyToken(`${forged}.${sig}`, 'confirm', SECRET)).toBeNull()
    void body
  })
  it('rejects the wrong secret', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    expect(verifyToken(t, 'confirm', 'other-secret')).toBeNull()
  })
  it('rejects a purpose mismatch', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    expect(verifyToken(t, 'unsubscribe', SECRET)).toBeNull()
  })
  it('rejects an expired token', () => {
    const t = signToken({ purpose: 'magic', subjectId: 'abc', exp: 1_000 }, SECRET)
    expect(verifyToken(t, 'magic', SECRET, 2_000)).toBeNull()
  })
  it('rejects malformed input', () => {
    expect(verifyToken('garbage', 'confirm', SECRET)).toBeNull()
    expect(verifyToken('a.b.c', 'confirm', SECRET)).toBeNull()
  })
  it('rejects a token at its exact expiry moment', () => {
    const exp = Date.now() + 60_000
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp }, SECRET)
    expect(verifyToken(t, 'confirm', SECRET, exp)).toBeNull()
  })
  it('rejects a non-finite exp (JSON.stringify turns Infinity into null)', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Infinity }, SECRET)
    expect(verifyToken(t, 'confirm', SECRET)).toBeNull()
  })
  it('rejects an empty subjectId', () => {
    const t = signToken({ purpose: 'confirm', subjectId: '', exp: Date.now() + 60_000 }, SECRET)
    expect(verifyToken(t, 'confirm', SECRET)).toBeNull()
  })
  it('rejects a structurally valid token with a corrupted signature byte', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    const [body, sig] = t.split('.')
    const corrupted = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    expect(verifyToken(`${body}.${corrupted}`, 'confirm', SECRET)).toBeNull()
  })
})
