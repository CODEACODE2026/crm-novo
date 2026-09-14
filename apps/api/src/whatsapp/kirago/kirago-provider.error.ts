export type KiragoErrorCode =
  | 'KIRAGO_UNAVAILABLE'
  | 'KIRAGO_ADMIN_AUTH_FAILED'
  | 'KIRAGO_INSTANCE_AUTH_FAILED'
  | 'KIRAGO_RESOURCE_NOT_FOUND'
  | 'KIRAGO_TIMEOUT'
  | 'WHATSAPP_QR_NOT_AVAILABLE'
  | 'WHATSAPP_SEND_FAILED'
  | 'WHATSAPP_PROVIDER_ERROR';

export type KiragoErrorDetails = {
  method: string;
  path: string;
  status?: number;
  responseBody?: string;
};

export class KiragoProviderError extends Error {
  constructor(
    readonly code: KiragoErrorCode,
    message: string,
    readonly httpStatus = 502,
    readonly details?: KiragoErrorDetails,
  ) {
    super(message);
  }
}
