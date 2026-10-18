import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { JOB_EVENT_MESSAGE_MAX } from '../job-rules';

/** Free-text progress note recorded by the assigned professional (§6.1). */
export class JobProgressDto {
  @ApiProperty({ description: 'Avance a registrar (§6.1)', maxLength: JOB_EVENT_MESSAGE_MAX })
  @IsString()
  @IsNotEmpty()
  @MaxLength(JOB_EVENT_MESSAGE_MAX)
  message: string;
}

/** Why the professional could not finish (§6.2). Mandatory. */
export class JobIncompleteDto {
  @ApiProperty({ description: 'Motivo por el que no pudo terminar (§6.2)', maxLength: JOB_EVENT_MESSAGE_MAX })
  @IsString()
  @IsNotEmpty()
  @MaxLength(JOB_EVENT_MESSAGE_MAX)
  reason: string;
}

/** «No pudo concretarse» reason (§6.3). Mandatory. */
export class NotRealizedDto {
  @ApiProperty({ description: 'Motivo por el que no pudo concretarse (§6.3)', maxLength: JOB_EVENT_MESSAGE_MAX })
  @IsString()
  @IsNotEmpty()
  @MaxLength(JOB_EVENT_MESSAGE_MAX)
  reason: string;
}

/** Optional result when marking a job done (§6.1). */
export class CompleteJobDto {
  @ApiPropertyOptional({ description: 'Resultado del trabajo (§6.1)', maxLength: JOB_EVENT_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(JOB_EVENT_MESSAGE_MAX)
  result?: string;
}

/** Cancellation reason (§20.1). Mandatory. */
export class CancelOrderDto {
  @ApiProperty({ description: 'Motivo de la cancelación (§20.1)', maxLength: JOB_EVENT_MESSAGE_MAX })
  @IsString()
  @IsNotEmpty()
  @MaxLength(JOB_EVENT_MESSAGE_MAX)
  reason: string;
}
