import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { normalizeBrazilPhone } from './phone-normalizer';

describe('normalizeBrazilPhone', () => {
  it.each([
    ['(44) 99999-9999', '5544999999999'],
    ['44 99999-9999', '5544999999999'],
    ['+55 44 99999-9999', '5544999999999'],
    ['5544999999999', '5544999999999'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBrazilPhone(input)).toBe(expected);
  });

  it('rejects invalid phones', () => {
    expect(() => normalizeBrazilPhone('123')).toThrow(BadRequestException);
  });
});
