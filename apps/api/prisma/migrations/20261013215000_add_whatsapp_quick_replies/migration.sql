CREATE TABLE "whatsapp_quick_replies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "whatsapp_quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_quick_replies_isActive_sortOrder_idx" ON "whatsapp_quick_replies"("isActive", "sortOrder");
CREATE INDEX "whatsapp_quick_replies_sortOrder_idx" ON "whatsapp_quick_replies"("sortOrder");

INSERT INTO "whatsapp_quick_replies" ("label", "text", "isActive", "sortOrder", "updatedAt")
SELECT value->>'label', value->>'text', true, (value->>'sortOrder')::INTEGER, CURRENT_TIMESTAMP
FROM jsonb_array_elements(
  '[
    {"label":"Saudação","text":"Olá! Tudo bem? Como posso ajudar?","sortOrder":10},
    {"label":"Aguardando pagamento","text":"Olá! Ficamos no aguardo do pagamento. Assim que for identificado, damos continuidade.","sortOrder":20},
    {"label":"PIX expirado","text":"Esse PIX expirou. Posso gerar uma nova cobrança para você.","sortOrder":30},
    {"label":"Pagamento confirmado","text":"Pagamento confirmado. Obrigado!","sortOrder":40},
    {"label":"Retorno","text":"Assim que eu tiver uma atualização, retorno por aqui.","sortOrder":50},
    {"label":"Encerramento","text":"Qualquer dúvida, estou à disposição.","sortOrder":60}
  ]'::jsonb
) AS defaults(value)
WHERE NOT EXISTS (
  SELECT 1
  FROM "whatsapp_quick_replies" existing
  WHERE existing."label" = value->>'label'
);
