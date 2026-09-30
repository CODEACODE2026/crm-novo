import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { normalizeBrazilPhone } from './phone-normalizer';

describe('normalizeBrazilPhone', () => {
  it.each([
    ['(44) 99999-9999', '5544999999999'],
    ['44 99999-9999', '5544999999999'],
    ['+55 44 99999-9999', '5544999999999'],
    ['5544999999999', '5544999999999'],
    ['+55 (85) 9929-4022', '5585999294022'],
    ['55 85 9929-4022', '5585999294022'],
    ['(85) 9929-4022', '5585999294022'],
    ['+55 (85) 99929-4022', '5585999294022'],
    ['+55 (85) 3232-4022', '558532324022'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBrazilPhone(input)).toBe(expected);
  });

  it('rejects invalid phones', () => {
    expect(() => normalizeBrazilPhone('123')).toThrow(BadRequestException);
    expect(() => normalizeBrazilPhone('+1 (555) 9929-4022')).toThrow(BadRequestException);
  });
});
