-- WHATSAPP-CATEGORY-SYSTEMKEY1 production preflight.
-- Read-only by design. Run before the migration and review every result set.

SELECT
  (SELECT COUNT(*) FROM "whatsapp_connections") AS "connectionCount",
  COUNT(*) AS "categoryCount",
  COUNT(*) FILTER (WHERE NOT category."isActive") AS "inactiveCount",
  COUNT(*) FILTER (WHERE usage."attendanceCount" > 0) AS "withAttendanceHistoryCount"
FROM "whatsapp_attendance_categories" AS category
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS "attendanceCount"
  FROM "whatsapp_attendances" AS attendance
  WHERE attendance."categoryId" = category."id"
) AS usage ON TRUE;

WITH catalog("systemKey", "name", "normalizedName") AS (
  VALUES
    ('technical_support', 'Suporte técnico', 'suporte técnico'),
    ('guidance', 'Dúvida / orientação', 'dúvida / orientação'),
    ('new_product_service', 'Novo produto / serviço', 'novo produto / serviço'),
    ('finance_billing', 'Financeiro / cobrança', 'financeiro / cobrança'),
    ('renewal', 'Renovação', 'renovação'),
    ('registration_change', 'Alteração de cadastro', 'alteração de cadastro'),
    ('outage_issue', 'Problema / indisponibilidade', 'problema / indisponibilidade'),
    ('configuration', 'Configuração', 'configuração'),
    ('cancellation', 'Cancelamento', 'cancelamento'),
    ('commercial', 'Comercial', 'comercial'),
    ('other', 'Outro', 'outro')
)
SELECT
  connection."id" AS "connectionId",
  connection."name" AS "connectionName",
  catalog."systemKey",
  catalog."name" AS "catalogName",
  category."id" AS "categoryId",
  category."name" AS "currentName",
  category."isActive",
  COALESCE(usage."attendanceCount", 0) AS "attendanceCount",
  CASE
    WHEN category."id" IS NOT NULL THEN 'DETERMINISTIC_EXACT_LEGACY_IDENTITY'
    ELSE 'NO_EXACT_MATCH_REVIEW_REQUIRED'
  END AS "classification"
FROM "whatsapp_connections" AS connection
CROSS JOIN catalog
LEFT JOIN "whatsapp_attendance_categories" AS category
  ON category."whatsAppConnectionId" = connection."id"
 AND category."normalizedName" = catalog."normalizedName"
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS "attendanceCount"
  FROM "whatsapp_attendances" AS attendance
  WHERE attendance."categoryId" = category."id"
) AS usage ON TRUE
ORDER BY connection."name", catalog."systemKey";

WITH catalog("normalizedName") AS (
  VALUES
    ('suporte técnico'),
    ('dúvida / orientação'),
    ('novo produto / serviço'),
    ('financeiro / cobrança'),
    ('renovação'),
    ('alteração de cadastro'),
    ('problema / indisponibilidade'),
    ('configuração'),
    ('cancelamento'),
    ('comercial'),
    ('outro')
)
SELECT
  category."whatsAppConnectionId" AS "connectionId",
  category."id" AS "categoryId",
  category."name",
  category."normalizedName",
  category."isActive",
  COUNT(attendance."id") AS "attendanceCount",
  'CUSTOM_OR_RENAMED_REVIEW_IF_A_DEFAULT_SLOT_IS_MISSING' AS "classification"
FROM "whatsapp_attendance_categories" AS category
LEFT JOIN catalog ON catalog."normalizedName" = category."normalizedName"
LEFT JOIN "whatsapp_attendances" AS attendance ON attendance."categoryId" = category."id"
WHERE catalog."normalizedName" IS NULL
GROUP BY category."whatsAppConnectionId", category."id"
ORDER BY category."whatsAppConnectionId", category."normalizedName";

SELECT
  category."whatsAppConnectionId" AS "connectionId",
  category."normalizedName",
  COUNT(*) AS "duplicateCount",
  ARRAY_AGG(category."id" ORDER BY category."createdAt") AS "categoryIds"
FROM "whatsapp_attendance_categories" AS category
GROUP BY category."whatsAppConnectionId", category."normalizedName"
HAVING COUNT(*) > 1;
