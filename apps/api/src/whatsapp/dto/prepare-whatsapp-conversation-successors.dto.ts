import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class PrepareWhatsAppConversationSuccessorsDto {
  @IsUUID()
  targetConnectionId!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  batchKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @IsUUID('4', { each: true })
  predecessorConversationIds!: string[];

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  apply?: boolean = false;
}
