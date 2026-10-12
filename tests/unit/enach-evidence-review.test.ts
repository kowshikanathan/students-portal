import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AutopayAdminController } from '../../apps/api/src/mandate-autopay';
import type { Db } from '../../apps/api/src/db';
import type { AuthedRequest } from '../../apps/api/src/auth';

const tenantId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const authorId = '44444444-4444-4444-8444-444444444444';
const reviewerId = '55555555-5555-4555-8555-555555555555';
const actor = (id: string) => ({ actor: { id, tenantId } }) as AuthedRequest;

test('provider evidence records a tenant-scoped finding without changing mandate status', async () => {
  const writes: string[] = [];
  const audits: string[] = [];
  const db = {
    tx: async (work: any) =>
      work({
        query: async (sql: string, params: unknown[] = []) => {
          writes.push(sql);
          if (sql.includes('SELECT c.id FROM mandate_reconciliation_cases')) {
            assert.equal(params[1], tenantId);
            return { rows: [{ id: caseId }] };
          }
          if (sql.includes('INSERT INTO mandate_reconciliation_evidence')) {
            assert.equal(params[0], tenantId);
            assert.equal(params[1], caseId);
            assert.equal(params[4], authorId);
            return { rows: [{ id: evidenceId, case_id: caseId }] };
          }
          throw new Error('Unexpected SQL');
        },
      }),
    audit: async (_client: unknown, _actor: string, action: string) => {
      audits.push(action);
    },
  } as unknown as Db;

  await new AutopayAdminController(db).submitReconciliationEvidence(actor(authorId), caseId, {
    providerEvidenceReference: 'CASE-PROVIDER-001',
    finding: 'provider_outcome_inconclusive',
  });
  assert.deepEqual(audits, ['fees.mandate_reconciliation.evidence_submitted']);
  assert.equal(
    writes.some((sql) => sql.includes('UPDATE payment_mandate')),
    false,
  );
});

test('author cannot review their own eNACH evidence', async () => {
  let inserted = false;
  const db = {
    tx: async (work: any) =>
      work({
        query: async (sql: string) => {
          if (sql.includes('SELECT e.id,e.case_id,e.submitted_by')) {
            return { rows: [{ id: evidenceId, case_id: caseId, submitted_by: authorId }] };
          }
          if (sql.includes('INSERT INTO')) inserted = true;
          return { rows: [] };
        },
      }),
  } as unknown as Db;
  await assert.rejects(
    new AutopayAdminController(db).reviewReconciliationEvidence(actor(authorId), evidenceId, {
      decision: 'verified',
    }),
    /different reviewer/i,
  );
  assert.equal(inserted, false);
});

test('independent eNACH review is audited but cannot unblock mandate', async () => {
  const writes: string[] = [];
  const audits: string[] = [];
  const db = {
    tx: async (work: any) =>
      work({
        query: async (sql: string, args: unknown[] = []) => {
          writes.push(sql);
          if (sql.includes('SELECT e.id,e.case_id,e.submitted_by')) {
            assert.equal(args[1], tenantId);
            return { rows: [{ id: evidenceId, case_id: caseId, submitted_by: authorId }] };
          }
          if (sql.includes('INSERT INTO mandate_reconciliation_reviews')) {
            assert.deepEqual(args, [tenantId, evidenceId, 'verified', reviewerId]);
            return { rows: [{ id: '66666666-6666-4666-8666-666666666666' }] };
          }
          throw new Error('Unexpected SQL');
        },
      }),
    audit: async (_client: unknown, _actor: string, action: string) => {
      audits.push(action);
    },
  } as unknown as Db;
  await new AutopayAdminController(db).reviewReconciliationEvidence(actor(reviewerId), evidenceId, {
    decision: 'verified',
  });
  assert.deepEqual(audits, ['fees.mandate_reconciliation.evidence_reviewed']);
  assert.equal(
    writes.some((sql) => sql.includes('UPDATE payment_mandate')),
    false,
  );
});

test('unknown evidence review decision is rejected before database access', async () => {
  const db = {
    tx: async () => {
      throw new Error('unexpected database call');
    },
  } as unknown as Db;
  await assert.rejects(
    new AutopayAdminController(db).reviewReconciliationEvidence(actor(reviewerId), evidenceId, {
      decision: 'activate_mandate',
    }),
  );
});
