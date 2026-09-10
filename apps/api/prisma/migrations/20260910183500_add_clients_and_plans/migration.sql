CREATE TYPE "ClientStatus" AS ENUM ('ATIVO', 'INATIVO', 'CANCELADO');
CREATE TYPE "ClientEventType" AS ENUM ('CLIENT_CREATED', 'CLIENT_UPDATED', 'STATUS_CHANGED');

CREATE TABLE "plans" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "durationMonths" INTEGER NOT NULL,
  "defaultValue" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clients" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "email" TEXT,
  "reference" TEXT NOT NULL,
  "planId" UUID NOT NULL,
  "recurringValue" DECIMAL(12,2) NOT NULL,
  "dueDate" DATE NOT NULL,
  "billingNoticeDays" INTEGER NOT NULL,
  "notes" TEXT,
  "status" "ClientStatus" NOT NULL DEFAULT 'ATIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_status_history" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "previousStatus" "ClientStatus" NOT NULL,
  "newStatus" "ClientStatus" NOT NULL,
  "reason" TEXT,
  "changedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_events" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "type" "ClientEventType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");
CREATE UNIQUE INDEX "clients_phoneNormalized_key" ON "clients"("phoneNormalized");
CREATE UNIQUE INDEX "clients_reference_key" ON "clients"("reference");
CREATE INDEX "clients_status_idx" ON "clients"("status");
CREATE INDEX "clients_planId_idx" ON "clients"("planId");
CREATE INDEX "clients_dueDate_idx" ON "clients"("dueDate");
CREATE INDEX "clients_createdAt_idx" ON "clients"("createdAt");
CREATE INDEX "client_status_history_clientId_idx" ON "client_status_history"("clientId");
CREATE INDEX "client_status_history_createdAt_idx" ON "client_status_history"("createdAt");
CREATE INDEX "client_events_clientId_idx" ON "client_events"("clientId");
CREATE INDEX "client_events_type_idx" ON "client_events"("type");
CREATE INDEX "client_events_createdAt_idx" ON "client_events"("createdAt");

ALTER TABLE "clients" ADD CONSTRAINT "clients_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_status_history" ADD CONSTRAINT "client_status_history_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_status_history" ADD CONSTRAINT "client_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_events" ADD CONSTRAINT "client_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_events" ADD CONSTRAINT "client_events_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
