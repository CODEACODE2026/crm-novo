import { IsString, Equals } from 'class-validator';

export class DeleteClientConfirmationDto {
  @IsString()
  @Equals('REMOVER')
  confirmation!: string;
}
