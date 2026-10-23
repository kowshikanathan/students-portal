import { readFile } from 'node:fs/promises';
import { authenticator } from 'otplib';

try {
  const data = JSON.parse(await readFile('.data/local-access.json', 'utf8'));
  const token = authenticator.generate(data.authenticatorSetupKey);
  const timeRemaining = authenticator.timeRemaining();
  console.log('--- Current Staff Authentication Details ---');
  console.log('Email:', data.email);
  console.log('Password:', data.password);
  console.log('Authenticator Setup Key (Secret):', data.authenticatorSetupKey);
  console.log(`Current 6-digit code: ${token} (valid for ${timeRemaining}s)`);
  console.log('---------------------------------------------');
} catch {
  console.error('No .data/local-access.json found. Run npm run setup:native first.');
  process.exitCode = 1;
}
