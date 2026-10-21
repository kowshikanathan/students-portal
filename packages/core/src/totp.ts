import { authenticator } from 'otplib';

/** Allow one 30-second clock/entry offset and return the token's actual replay counter. */
export function authenticatorStep(code: string, secret: string, receivedAt = Date.now()) {
  const verifier = authenticator.clone({ epoch: receivedAt, window: 1 });
  const delta = verifier.checkDelta(code, secret);
  return delta === null ? null : Math.floor(receivedAt / 30000) + delta;
}
