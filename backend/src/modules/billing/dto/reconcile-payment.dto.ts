import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { RECONCILE_RESOLUTIONS } from '../invoice-rules';

/** Resolves a suspected duplicate, keeping both records (§11.1, D6). */
export class ReconcilePaymentDto {
  @ApiProperty({
    description: 'same = es el mismo pago (no suma); distinct = es otro pago (suma)',
    enum: RECONCILE_RESOLUTIONS,
  })
  @IsIn([...RECONCILE_RESOLUTIONS])
  resolution: (typeof RECONCILE_RESOLUTIONS)[number];
}
