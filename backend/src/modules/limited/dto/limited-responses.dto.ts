import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the limited-access endpoints (Option A, approved
 * 20/10/2026: frontend spec F3-D1 and the F3-D2 addition). Documentation
 * only — no behaviour change — they mirror the existing serialization
 * (`limited.service.listOrders`/`createRequest`/`listProperties`) so the
 * generated API client gets real types (frontend AGENTS.md).
 */

/** One order visible to a limited account (§4.3): status only — no costs,
 * no access codes, no other relations. */
export class LimitedOrderViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: OrderStatus, description: 'Estado de la orden (§20.1)' })
  status: OrderStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

/** Result of placing a work request (§4.3, §5.1): an order in `requested`
 * that a company user must convert. */
export class LimitedRequestViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: OrderStatus, description: 'Siempre `requested` (§20.1)' })
  status: OrderStatus;
}

/** One property a limited account may target with a request (F3-D2): the
 * account's own housing, or — for a client tenant — the properties of
 * their own orders (§4.3: never another property or relation). */
export class LimitedPropertyViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  addressLine: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;
}

/** Result of converting a requested order into a real one (§20.1, §5.1). */
export class ConvertOrderViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: OrderStatus, description: 'Siempre open tras convertir' })
  status: OrderStatus;
}
