import { describe, expect, it } from 'vitest';
import { BillingTemplateRenderer } from './billing-template-renderer';

describe('BillingTemplateRenderer', () => {
  const renderer = new BillingTemplateRenderer();

  it('renders allowed billing variables without eval', () => {
    const result = renderer.render(
      'Oi {{primeiroNome}}, {{valor}} vence em {{vencimento}} no plano {{plano}} ref {{referencia}} atraso {{diasAtraso}}.',
      {
        nome: 'Bruno Code',
        primeiroNome: 'Bruno',
        valor: 'R$ 50,00',
        vencimento: '15/09/2026',
        plano: 'Mensal',
        referencia: 'bruno1499',
        diasAtraso: '7',
        pix: '',
      },
    );

    expect(result).toBe(
      'Oi Bruno, R$ 50,00 vence em 15/09/2026 no plano Mensal ref bruno1499 atraso 7.',
    );
  });

  it('removes unknown variables safely', () => {
    const result = renderer.render('Oi {{nome}} {{process.env.SECRET}}.', {
      nome: 'Bruno',
      primeiroNome: 'Bruno',
      valor: 'R$ 50,00',
      vencimento: '15/09/2026',
      plano: 'Mensal',
      referencia: 'bruno1499',
      diasAtraso: '',
      pix: '',
    });

    expect(result).toBe('Oi Bruno .');
  });

  it('maps effective variables by template type', () => {
    expect(renderer.variables).toEqual([
      'nome',
      'primeiroNome',
      'valor',
      'vencimento',
      'plano',
      'referencia',
      'diasAtraso',
      'pix',
      'quantidade',
      'itens',
      'valorTotal',
    ]);
    expect(renderer.effectiveVariablesForType('BILLING_DUE')).toEqual([
      'nome',
      'primeiroNome',
      'valor',
      'vencimento',
      'plano',
      'referencia',
    ]);
    expect(renderer.effectiveVariablesForType('BILLING_DUE_GROUPED')).toEqual([
      'nome',
      'primeiroNome',
      'quantidade',
      'itens',
      'valorTotal',
    ]);
    for (const type of [
      'RECOVERY_DAY_3',
      'RECOVERY_DAY_7',
      'RECOVERY_DAY_10',
      'RECOVERY_DAY_15',
      'RECOVERY_DAY_30',
    ] as const) {
      expect(renderer.effectiveVariablesForType(type)).toEqual([
        'nome',
        'primeiroNome',
        'valor',
        'vencimento',
        'plano',
        'referencia',
        'diasAtraso',
      ]);
    }
    expect(renderer.effectiveVariablesForType('INITIAL_ACTIVATION')).toEqual([
      'nome',
      'primeiroNome',
      'valor',
      'vencimento',
      'plano',
      'referencia',
      'pix',
    ]);
  });

  it('builds contextual preview samples without filling unavailable runtime variables', () => {
    const content =
      '{{nome}}|{{primeiroNome}}|{{valor}}|{{vencimento}}|{{plano}}|{{referencia}}|{{diasAtraso}}|{{pix}}|{{quantidade}}|{{itens}}|{{valorTotal}}';

    expect(renderer.render(content, renderer.previewContextForType('BILLING_DUE'))).toBe(
      'Bruno|Bruno|R$ 50,00|15/09/2026|Mensal|bruno1499|||||',
    );
    expect(renderer.render(content, renderer.previewContextForType('BILLING_DUE_GROUPED'))).toBe(
      'Bruno|Bruno|||||||3|• teste01 — R$ 30,00 — vence 15/09/2026\n• teste02 — R$ 30,00 — vence 15/09/2026\n• teste03 — R$ 30,00 — vence 15/09/2026|R$ 90,00',
    );
    expect(renderer.render(content, renderer.previewContextForType('RECOVERY_DAY_7'))).toBe(
      'Bruno|Bruno|R$ 50,00|15/09/2026|Mensal|bruno1499|7||||',
    );
    expect(renderer.render(content, renderer.previewContextForType('INITIAL_ACTIVATION'))).toBe(
      'Bruno|Bruno|R$ 50,00|15/09/2026|Mensal|bruno1499||000201...|||',
    );
  });
});
