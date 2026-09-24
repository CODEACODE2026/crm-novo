-- Add local operational status for PIX attempts replaced by an operator.
-- Existing partial active-intent indexes remain unchanged and continue to
-- consider only CREATED and WAITING_PAYMENT active.
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'SUPERSEDED';
