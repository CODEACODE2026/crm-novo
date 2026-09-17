import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const clientFormSource = readFileSync(join(currentDir, 'client-form.tsx'), 'utf8');

describe('ClientForm manual initial billing source', () => {
  it('keeps manual initial activation explicit and warns referrals without it', () => {
    expect(clientFormSource).toContain('generateInitialReceivable');
    expect(clientFormSource).toContain('Aguardar pagamento para ativar este serviço');
    expect(clientFormSource).toContain('Status inicial');
    expect(clientFormSource).toContain('Pendente de pagamento');
    expect(clientFormSource).toContain('Primeira cobrança');
    expect(clientFormSource).toContain('Ativação inicial');
    expect(clientFormSource).toContain('Sem cobrança inicial, esta indicação não será qualificada');
  });
});
