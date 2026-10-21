import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTOs for the client endpoints (Option A, approved 20/10/2026:
 * frontend spec F3-D1). Documentation only — no behaviour change — they mirror
 * the existing serialization (`clients.service.list`/`create`) so the
 * generated API client gets real types (frontend AGENTS.md).
 */

/** One client of an own_business professional (§2.3, §5.1). */
export class ClientViewDto {
  @ApiProperty({ format: 'uuid', description: 'Id del tenant del cliente' })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Id de la relación comercial con el cliente' })
  relationshipId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  email: string | null;

  @ApiProperty({ type: [String] })
  phones: string[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

/** Result of registering a client; `accessIssued` reports whether the
 * limited access link was emailed (§4.3). */
export class ClientCreateResultViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  relationshipId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  email: string | null;

  @ApiProperty({ description: 'Se envió el enlace de acceso limitado por correo (§4.3)' })
  accessIssued: boolean;
}
