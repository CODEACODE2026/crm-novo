CREATE UNIQUE INDEX "receivables_clientReferenceId_purpose_dueDate_key"
ON "receivables"("clientReferenceId", "purpose", "dueDate");
