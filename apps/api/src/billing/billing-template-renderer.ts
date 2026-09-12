import { Injectable } from '@nestjs/common';

export type BillingTemplateContext = {
  nome: string;
  primeiroNome: string;
  valor: string;
  vencimento: string;
  plano: string;
  referencia: string;
  pix: string;
};

const allowedVariables = [
  'nome',
  'primeiroNome',
  'valor',
  'vencimento',
  'plano',
  'referencia',
  'pix',
] as const;

@Injectable()
export class BillingTemplateRenderer {
  readonly variables = allowedVariables;

  render(content: string, context: BillingTemplateContext) {
    return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, variable: string) => {
      if (!this.isAllowedVariable(variable)) {
        return '';
      }

      return context[variable];
    });
  }

  private isAllowedVariable(variable: string): variable is keyof BillingTemplateContext {
    return allowedVariables.includes(variable as keyof BillingTemplateContext);
  }
}
