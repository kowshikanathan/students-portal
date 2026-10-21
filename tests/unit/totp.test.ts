import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import { authenticatorStep } from '../../packages/core/src/totp';

test('MFA accepts adjacent time windows and returns the actual token counter for replay protection', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = 1800000010000;
  for (const offset of [-1, 0, 1]) {
    const code = authenticator.clone({ epoch: now + offset * 30000 }).generate(secret);
    assert.equal(authenticatorStep(code, secret, now), Math.floor(now / 30000) + offset);
  }
  for (const offset of [-3, 3]) {
    const code = authenticator.clone({ epoch: now + offset * 30000 }).generate(secret);
    assert.equal(authenticatorStep(code, secret, now), null);
  }
});
