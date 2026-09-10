import { PartialType } from '@nestjs/mapped-types';
import { CreateManualTransactionDto } from './create-manual-transaction.dto';

export class UpdateManualTransactionDto extends PartialType(CreateManualTransactionDto) {}
