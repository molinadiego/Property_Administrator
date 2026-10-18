import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsString,
  ValidateNested,
} from 'class-validator';

/** One toggleable notice type (spec etapa-6.md §4.3). */
export class NotificationPreferenceEntryDto {
  @ApiProperty({ example: 'urgent_reminder', description: 'Tipo de aviso del conjunto cerrado' })
  @IsString()
  type: string;

  @ApiProperty({ example: true, description: '¿Enviar correo además del aviso en la aplicación?' })
  @IsBoolean()
  emailEnabled: boolean;
}

/** Replaces the user's email preferences for the submitted types (§18.4). */
export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceEntryDto)
  preferences: NotificationPreferenceEntryDto[];
}
