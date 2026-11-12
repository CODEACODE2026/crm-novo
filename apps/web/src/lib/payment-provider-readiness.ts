import type { PaymentProviderCredentialStatus } from './crm-api';

export type PaymentProviderCredentialReadiness = {
  label: string;
  operational: boolean;
  reason: string | null;
  tone: 'danger' | 'muted' | 'success' | 'warning';
};

export function paymentProviderCredentialReadiness(
  credential: PaymentProviderCredentialStatus,
  now = new Date(),
): PaymentProviderCredentialReadiness {
  if (!credential.configured || credential.active === false) {
    return {
      label: 'Não configurada',
      operational: false,
      reason: 'Cadastre e valide a credencial antes de selecionar este provedor.',
      tone: 'muted',
    };
  }

  if (credential.status === 'ERRO' || credential.status === 'DESABILITADO') {
    return {
      label: credential.status === 'ERRO' ? 'Validação com erro' : 'Desabilitada',
      operational: false,
      reason: 'Teste novamente a conexão antes de usar este provedor.',
      tone: 'danger',
    };
  }

  if (credential.provider !== 'MERCADO_PAGO') {
    const operational = credential.status === 'CONFIGURADO' || credential.status === 'VALIDO';
    return {
      label: operational ? 'Operacional' : 'Validação pendente',
      operational,
      reason: operational ? null : 'Teste novamente a conexão antes de usar este provedor.',
      tone: operational ? 'success' : 'warning',
    };
  }

  if (credential.environment !== 'TEST') {
    return {
      label: 'Produção bloqueada',
      operational: false,
      reason: 'Mercado Pago PRODUCTION exige homologação e autorização separadas.',
      tone: 'danger',
    };
  }

  if (credential.environmentProofStatus !== 'VERIFIED_TEST') {
    return {
      label: 'Prova TEST pendente',
      operational: false,
      reason: 'Teste a conexão para comprovar a identidade oficial do vendedor TEST.',
      tone: 'warning',
    };
  }

  const proofExpiresAt = credential.environmentProofExpiresAt
    ? Date.parse(credential.environmentProofExpiresAt)
    : Number.NaN;

  if (!Number.isFinite(proofExpiresAt) || proofExpiresAt <= now.getTime()) {
    return {
      label: 'Prova TEST expirada',
      operational: false,
      reason: 'Renove a prova TEST com “Testar conexão” antes de gerar ou consultar um PIX.',
      tone: 'warning',
    };
  }

  if (credential.status !== 'VALIDO') {
    return {
      label: 'Validação pendente',
      operational: false,
      reason: 'Teste novamente a conexão antes de usar o Mercado Pago.',
      tone: 'warning',
    };
  }

  return {
    label: 'TEST verificado',
    operational: true,
    reason: null,
    tone: 'success',
  };
}

export function isOperationalPixProviderCredential(
  credential: PaymentProviderCredentialStatus,
  now?: Date,
) {
  return paymentProviderCredentialReadiness(credential, now).operational;
}
