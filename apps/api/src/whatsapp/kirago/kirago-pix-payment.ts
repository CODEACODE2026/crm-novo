import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SendPixPaymentInput } from '../provider/whatsapp-provider';

export type KiragoPixPaymentSerializerInput = {
  phone: string;
  body: string;
  merchantName: string;
  pixCopyPaste: string;
  amount: Prisma.Decimal | number | string;
  referenceId: string;
  itemName: string;
};

export function buildKiragoPixPayment(input: KiragoPixPaymentSerializerInput): SendPixPaymentInput {
  const merchantName = input.merchantName.trim();
  const key = input.pixCopyPaste.trim();
  const referenceId = input.referenceId.trim();
  const itemName = input.itemName.trim().slice(0, 64);
  const decimalAmount = new Prisma.Decimal(input.amount);
  const amount = decimalAmount.mul(100);

  if (merchantName.length < 2 || merchantName.length > 25) {
    throw new BadRequestException('Nome do recebedor PIX no WhatsApp invalido.');
  }
  if (!key) throw new BadRequestException('PIX sem copia e cola disponivel.');
  if (!referenceId || !itemName) {
    throw new BadRequestException('PIX sem referencia ou descricao valida para WhatsApp.');
  }
  if (!decimalAmount.isPositive() || !amount.isInteger()) {
    throw new BadRequestException('Valor PIX invalido para WhatsApp.');
  }

  const amountInCents = amount.toNumber();
  if (!Number.isSafeInteger(amountInCents)) {
    throw new BadRequestException('Valor PIX excede o limite seguro para WhatsApp.');
  }

  return {
    phone: input.phone,
    title: 'PIX',
    body: input.body,
    pixPayment: {
      merchantName,
      key,
      keyType: 'EVP',
      displayText: 'Copiar Chave PIX',
      amount: amountInCents,
      offset: 100,
      currency: 'BRL',
      referenceId,
      itemName,
    },
  };
}
