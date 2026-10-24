import { describe, expect, it } from 'vitest';
import { resolvePhoneOperationCapability } from './phone-operation-capability';

describe('resolvePhoneOperationCapability', () => {
  it('authorizes an operation without accepting country as policy input', () => {
    expect(
      resolvePhoneOperationCapability({
        operation: 'MANUAL_MEDIA',
        identityValid: true,
        operationEnabled: true,
        administrativePermission: true,
        providerSupported: true,
      }),
    ).toEqual({ status: 'allowed', operation: 'MANUAL_MEDIA' });
  });

  it.each([
    [{ identityValid: false }, 'INVALID_IDENTITY'],
    [{ operationEnabled: false }, 'OPERATION_DISABLED'],
    [{ administrativePermission: false }, 'ADMIN_PERMISSION_REQUIRED'],
    [{ providerSupported: false }, 'PROVIDER_UNSUPPORTED'],
    [{ financialAuthorization: false }, 'FINANCIAL_AUTHORIZATION_REQUIRED'],
  ] as const)('fails closed for independent policy input %#', (override, reason) => {
    expect(
      resolvePhoneOperationCapability({
        operation: 'BILLING',
        identityValid: true,
        operationEnabled: true,
        administrativePermission: true,
        providerSupported: true,
        financialAuthorization: true,
        ...override,
      }),
    ).toEqual({ status: 'blocked', operation: 'BILLING', reason });
  });
});
