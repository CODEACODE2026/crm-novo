import { PartialType } from '@nestjs/mapped-types';
import { CreateClientReferenceDto } from './create-client-reference.dto';

export class UpdateClientReferenceDto extends PartialType(CreateClientReferenceDto) {}
