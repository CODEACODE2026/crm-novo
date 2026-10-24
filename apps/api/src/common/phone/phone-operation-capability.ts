export type PhoneOperation =
  | 'CLIENT_PHONE_WRITE'
  | 'MANUAL_TEXT'
  | 'MESSAGE_ACTION'
  | 'MANUAL_MEDIA'
  | 'MANUAL_VOICE'
  | 'MANUAL_PIX'
  | 'PIX_BUTTON'
  | 'AUTO_REPLY'
  | 'BILLING'
  | 'RECOVERY';

export type PhoneOperationCapabilityInput = {
  operation: PhoneOperation;
  identityValid: boolean;
  operationEnabled: boolean;
  administrativePermission?: boolean;
  providerSupported?: boolean;
  financialAuthorization?: boolean;
};

export type PhoneOperationCapabilityResult =
  | { status: 'allowed'; operation: PhoneOperation }
  | {
      status: 'blocked';
      operation: PhoneOperation;
      reason:
        | 'ADMIN_PERMISSION_REQUIRED'
        | 'FINANCIAL_AUTHORIZATION_REQUIRED'
        | 'INVALID_IDENTITY'
        | 'OPERATION_DISABLED'
        | 'PROVIDER_UNSUPPORTED';
    };

/** Pure policy boundary: geographic country is deliberately not an input. */
export function resolvePhoneOperationCapability(
  input: PhoneOperationCapabilityInput,
): PhoneOperationCapabilityResult {
  if (!input.identityValid) {
    return { status: 'blocked', operation: input.operation, reason: 'INVALID_IDENTITY' };
  }
  if (!input.operationEnabled) {
    return { status: 'blocked', operation: input.operation, reason: 'OPERATION_DISABLED' };
  }
  if (input.administrativePermission === false) {
    return {
      status: 'blocked',
      operation: input.operation,
      reason: 'ADMIN_PERMISSION_REQUIRED',
    };
  }
  if (input.providerSupported === false) {
    return { status: 'blocked', operation: input.operation, reason: 'PROVIDER_UNSUPPORTED' };
  }
  if (input.financialAuthorization === false) {
    return {
      status: 'blocked',
      operation: input.operation,
      reason: 'FINANCIAL_AUTHORIZATION_REQUIRED',
    };
  }

  return { status: 'allowed', operation: input.operation };
}
