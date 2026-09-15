INSERT INTO "message_templates" ("type", "name", "content", "active", "createdAt", "updatedAt")
VALUES (
  'RECOVERY_DAY_7',
  'Recuperação 7 dias',
  'Olá, {{primeiroNome}}. O pagamento da referência {{referencia}}, vencido em {{vencimento}}, ainda consta em aberto no valor de {{valor}}. Para evitar que a pendência continue, pedimos que regularize assim que possível. Se precisar de ajuda, fale conosco.',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("type", "name") DO NOTHING;
