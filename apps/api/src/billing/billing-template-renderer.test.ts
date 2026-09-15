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
});
