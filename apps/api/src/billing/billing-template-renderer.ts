import { Injectable } from '@nestjs/common';

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

@Injectable()
export class BillingTemplateRenderer {
  readonly variables = allowedVariables;

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
}
