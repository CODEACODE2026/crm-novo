import { Injectable } from '@nestjs/common';
import type { MessageTemplateType } from '@prisma/client';

export type BillingTemplateContext = {
  nome: string;
  primeiroNome: string;
  valor: string;
  vencimento: string;
  plano: string;
  referencia: string;
  diasAtraso: string;
  pix: string;
  quantidade?: string;
  itens?: string;
  valorTotal?: string;
};

const allowedVariables = [
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
] as const;

type BillingTemplateVariable = (typeof allowedVariables)[number];

const billingIndividualVariables = [
  'nome',
  'primeiroNome',
  'valor',
  'vencimento',
  'plano',
  'referencia',
] as const satisfies readonly BillingTemplateVariable[];

const billingGroupedVariables = [
  'nome',
  'primeiroNome',
  'quantidade',
  'itens',
  'valorTotal',
] as const satisfies readonly BillingTemplateVariable[];

const recoveryVariables = [
  'nome',
  'primeiroNome',
  'valor',
  'vencimento',
  'plano',
  'referencia',
  'diasAtraso',
] as const satisfies readonly BillingTemplateVariable[];

const initialActivationVariables = [
  'nome',
  'primeiroNome',
  'valor',
  'vencimento',
  'plano',
  'referencia',
  'pix',
] as const satisfies readonly BillingTemplateVariable[];

const emptyContext = {
  nome: '',
  primeiroNome: '',
  valor: '',
  vencimento: '',
  plano: '',
  referencia: '',
  diasAtraso: '',
  pix: '',
  quantidade: '',
  itens: '',
  valorTotal: '',
} satisfies BillingTemplateContext;

@Injectable()
export class BillingTemplateRenderer {
  readonly variables = allowedVariables;

  effectiveVariablesForType(type: MessageTemplateType) {
    if (type === 'INITIAL_ACTIVATION') return [...initialActivationVariables];
    if (type === 'BILLING_DUE_GROUPED') return [...billingGroupedVariables];
    if (type === 'BILLING_DUE') return [...billingIndividualVariables];
    return [...recoveryVariables];
  }

  previewContextForType(
    type: MessageTemplateType,
    overrides: Partial<
      Record<
        keyof Pick<
          BillingTemplateContext,
          'nome' | 'valor' | 'vencimento' | 'plano' | 'referencia' | 'diasAtraso'
        >,
        string | undefined
      >
    > = {},
  ): BillingTemplateContext {
    const nome = overrides.nome || 'Bruno';
    const common = {
      nome,
      primeiroNome: this.firstName(nome),
    };

    if (type === 'INITIAL_ACTIVATION') {
      return {
        ...emptyContext,
        ...common,
        valor: overrides.valor || 'R$ 50,00',
        vencimento: overrides.vencimento || '15/09/2026',
        plano: overrides.plano || 'Mensal',
        referencia: overrides.referencia || 'bruno1499',
        pix: '000201...',
      };
    }

    if (type === 'BILLING_DUE_GROUPED') {
      return {
        ...emptyContext,
        ...common,
        quantidade: '3',
        itens:
          '• teste01 — R$ 30,00 — vence 15/09/2026\n• teste02 — R$ 30,00 — vence 15/09/2026\n• teste03 — R$ 30,00 — vence 15/09/2026',
        valorTotal: 'R$ 90,00',
      };
    }

    if (type === 'BILLING_DUE') {
      return {
        ...emptyContext,
        ...common,
        valor: overrides.valor || 'R$ 50,00',
        vencimento: overrides.vencimento || '15/09/2026',
        plano: overrides.plano || 'Mensal',
        referencia: overrides.referencia || 'bruno1499',
      };
    }

    return {
      ...emptyContext,
      ...common,
      valor: overrides.valor || 'R$ 50,00',
      vencimento: overrides.vencimento || '15/09/2026',
      plano: overrides.plano || 'Mensal',
      referencia: overrides.referencia || 'bruno1499',
      diasAtraso: overrides.diasAtraso || '7',
    };
  }

  render(content: string, context: BillingTemplateContext) {
    return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, variable: string) => {
      if (!this.isAllowedVariable(variable)) {
        return '';
      }

      return context[variable] ?? '';
    });
  }

  unsupportedVariables(content: string) {
    const variables = new Set<string>();

    for (const match of content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
      const variable = match[1];

      if (variable && !this.isAllowedVariable(variable)) {
        variables.add(variable);
      }
    }

    return [...variables];
  }

  private isAllowedVariable(variable: string): variable is keyof BillingTemplateContext {
    return allowedVariables.includes(variable as keyof BillingTemplateContext);
  }

  private firstName(name: string) {
    return name.trim().split(/\s+/)[0] || name.trim();
  }
}
