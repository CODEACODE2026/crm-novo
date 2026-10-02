-- MANUALPIX1 phase 1: add the purpose in its own migration.
-- PostgreSQL requires enum additions to commit before the new value is used in
-- CHECK constraints or partial indexes.

ALTER TYPE "ReceivablePurpose" ADD VALUE IF NOT EXISTS 'MANUAL_CHARGE';
