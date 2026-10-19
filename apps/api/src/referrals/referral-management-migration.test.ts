import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261019200000_add_referral_management_audit/migration.sql',
  ),
  'utf8',
);

describe('referral management audit migration', () => {
  it('adds origin, traceability and a referral-owned history without replacing client events', () => {
    expect(schema).toContain('enum ReferralOrigin');
    expect(schema).toContain('AUTOMATIC');
    expect(schema).toContain('MANUAL');
    expect(schema).toContain('model ReferralHistory');
    expect(schema).toContain('qualificationReceivableId');
    expect(schema).toContain('canceledByUserId');
    expect(schema).toContain('REFERRAL_CREATED');
    expect(schema).toContain('REFERRAL_REWARD_APPLIED');
  });

  it('keeps existing referrals automatic and uses nullable additive foreign keys', () => {
    expect(migration).toContain(
      'ADD COLUMN "origin" "ReferralOrigin" NOT NULL DEFAULT \'AUTOMATIC\'',
    );
    expect(migration).toContain('ADD COLUMN "qualificationReceivableId" UUID');
    expect(migration).toContain('ADD COLUMN "canceledByUserId" UUID');
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+"referrals"\b/i);
  });
});
