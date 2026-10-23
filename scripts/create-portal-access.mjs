import { Pool } from 'pg';
import { randomUUID, randomBytes, createCipheriv, createHash } from 'node:crypto';

if (process.env.DATABASE_URL == null) {
  process.loadEnvFile('.env');
}

const digest = (s) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');

function encrypt(value) {
  const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32) throw Error('DATA_ENCRYPTION_KEY must be 32 bytes');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), bytes].map((b) => b.toString('base64url')).join('.');
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const actor = (await pool.query(
      "SELECT m.user_id, m.tenant_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.role_key='owner' AND m.status='active' LIMIT 1"
    )).rows[0];

    if (!actor) throw Error('No active owner found in database');

    const studentsToSetup = [
      {
        ref: 'STU001',
        name: 'sharma',
        email: 'Kowshika18@gmail.com',
        phone: '+919361308305',
        parentName: 'Parent of Sharma',
        planName: 'Grade 1 Tuition & Fees',
        amountMinor: 2500000
      },
      {
        ref: 'STU-2026-001',
        name: 'Aarav Patel',
        email: 'aarav.patel@example.com',
        phone: '+919876543210',
        parentName: 'Ramesh Patel',
        planName: 'Annual Academic Comprehensive Plan',
        amountMinor: 3500000
      }
    ];

    const results = [];

    for (const item of studentsToSetup) {
      let stu = (await pool.query(
        "SELECT id FROM academic_students WHERE lower(student_reference)=lower($1) AND tenant_id=$2",
        [item.ref, actor.tenant_id]
      )).rows[0];

      let studentId;
      if (stu) {
        studentId = stu.id;
        await pool.query(
          "UPDATE academic_students SET status='active', email=$1, phone=$2 WHERE id=$3",
          [item.email, item.phone, studentId]
        );
      } else {
        studentId = randomUUID();
        await pool.query(
          "INSERT INTO academic_students(id, tenant_id, student_reference, full_name, email, phone, status, created_by) VALUES($1, $2, $3, $4, $5, $6, 'active', $7)",
          [studentId, actor.tenant_id, item.ref, item.name, item.email, item.phone, actor.user_id]
        );
      }

      // Check existing assignment
      const existingAssignment = (await pool.query(
        "SELECT schedule_id FROM student_fee_plan_assignments WHERE student_id=$1 AND tenant_id=$2",
        [studentId, actor.tenant_id]
      )).rows[0];

      let scheduleId;
      if (existingAssignment) {
        scheduleId = existingAssignment.schedule_id;
      } else {
        // Create Payer
        const payerId = randomUUID();
        const accountRef = item.ref + '-ACC';
        await pool.query(
          "INSERT INTO fee_payers(id, tenant_id, account_reference, encrypted_profile, preferred_channel, active, created_by) VALUES($1, $2, $3, $4, 'email', true, $5)",
          [
            payerId,
            actor.tenant_id,
            accountRef,
            encrypt({
              displayName: item.parentName,
              email: item.email,
              phone: item.phone,
            }),
            actor.user_id,
          ]
        );

        // Create Plan
        const planId = randomUUID();
        await pool.query(
          "INSERT INTO fee_plan_versions(id, tenant_id, plan_key, version, name, status, created_by) VALUES($1, $2, $3, 1, $4, 'effective', $5)",
          [planId, actor.tenant_id, item.ref.toLowerCase(), item.planName, actor.user_id]
        );

        // Create Fee Schedule
        scheduleId = randomUUID();
        await pool.query(
          "INSERT INTO fee_schedules(id, tenant_id, account_reference, total_amount_minor, status, payer_id, created_by) VALUES($1, $2, $3, $4, 'active', $5, $6)",
          [scheduleId, actor.tenant_id, accountRef, item.amountMinor, payerId, actor.user_id]
        );

        // Create Installments
        await pool.query(
          "INSERT INTO fee_installments(tenant_id, schedule_id, sequence, due_date, amount_minor) VALUES($1, $2, 1, current_date + 30, $3)",
          [actor.tenant_id, scheduleId, item.amountMinor]
        );

        // Link Assignment
        await pool.query(
          "INSERT INTO student_fee_plan_assignments(tenant_id, student_id, plan_id, schedule_id, created_by) VALUES($1, $2, $3, $4, $5)",
          [actor.tenant_id, studentId, planId, scheduleId, actor.user_id]
        );
      }

      // Generate Access Token
      const accessCode = token();
      await pool.query(
        "INSERT INTO payer_access_tokens(tenant_id, schedule_id, token_hash, expires_at, created_by) VALUES($1, $2, $3, now() + interval '30 days', $4)",
        [actor.tenant_id, scheduleId, digest(accessCode), actor.user_id]
      );

      results.push({
        studentRef: item.ref,
        studentName: item.name,
        accessCode: accessCode,
        payerPortalUrl: 'http://localhost:3000/payer/' + accessCode
      });
    }

    console.log('SUCCESS_RESULTS:', JSON.stringify(results, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});