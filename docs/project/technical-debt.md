# Debitos Tecnicos

## Bloqueante

- Nenhum debito bloqueante registrado ao final da Sprint 11.

## Antes de producao

- Homologar Kirago real em ambiente externo controlado.
- Homologar FastFlow/FastPay com credencial real na maquina de teste.
- Homologar webhook real externo de pagamentos com URL publica HTTPS.
- Validar backup e restore do banco antes de importacao legado.
- Revisar CORS/cookies/JWT secret com variaveis definitivas de producao.

## Futuro

- Corrigir warning do Next para `<img>` usado no QR Code PIX quando houver estrategia final de imagem.
- Resolver limitacao local de shadow database do `prisma migrate dev`.
- Definir regra contabil/financeira completa para `refunded` apos baixa.
- Evoluir configuracao multiempresa.
- Implementar importacao legado apos homologacao geral.
- Avaliar busca global no header caso o volume operacional justifique.
- Avaliar PDF em relatorios apos estabilizacao do CSV.
