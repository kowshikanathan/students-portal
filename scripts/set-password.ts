import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 16) {
    console.error('Usage: npx tsx scripts/set-password.ts <email> <password-at-least-16-chars>');
    process.exitCode = 1;
    return;
  }
  process.loadEnvFile('.env');
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL });
  try {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const res = await pool.query('UPDATE users SET password_hash=$1 WHERE lower(email)=$2 RETURNING id', [
      hash,
      email.toLowerCase(),
    ]);
    if (!res.rowCount) {
      console.error(`User ${email} not found.`);
      process.exitCode = 1;
      return;
    }
    const accessFile = '.data/local-access.json';
    if (existsSync(accessFile)) {
      try {
        const data = JSON.parse(await readFile(accessFile, 'utf8'));
        if (data.email.toLowerCase() === email.toLowerCase()) {
          data.password = password;
          await writeFile(accessFile, JSON.stringify(data, null, 2));
        }
      } catch {}
    }
    console.log(`Password updated successfully for ${email}.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
