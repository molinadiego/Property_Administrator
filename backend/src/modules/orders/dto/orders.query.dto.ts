import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import type { OrderStatusValue } from '../job-rules';
import {
  ASSIGNMENT_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  parseStatusFilter,
  type AssignmentStatusValue,
} from '../order-filters';

/** Query filters of `GET /companies/:id/orders` (BE-1, spec §4). */
export class OrdersQueryDto {
  @ApiPropertyOptional({
    type: String,
    description:
      'Estado(s) de orden separados por coma (§20.1); admite requested, open, assigned, in_progress, completed, cancelled',
    example: 'open,assigned,in_progress',
  })
  @Transform(({ value }) => parseStatusFilter(value))
  @IsOptional()
  @IsIn(ORDER_STATUS_VALUES, { each: true })
  status?: OrderStatusValue[];

  @ApiPropertyOptional({
    type: String,
    enum: [...ASSIGNMENT_STATUS_VALUES],
    description:
      'Restringe a órdenes con una asignación del llamador en ese estado (§5.6, §2.12); solo pending|accepted',
    example: 'pending',
  })
  @IsOptional()
  @IsIn([...ASSIGNMENT_STATUS_VALUES])
  assignment_status?: AssignmentStatusValue;
}
