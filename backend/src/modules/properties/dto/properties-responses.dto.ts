import { ApiProperty } from '@nestjs/swagger';
import { PropertyOccupancy, PropertyTenantKind } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the property endpoints (Option A, approved 20/10/2026:
 * frontend spec F3-D1). Documentation only — no behaviour change — they mirror
 * the existing serialization (`properties.service.serializeProperty`,
 * `getDetail`, `createTenant`, `updateTenant`) so the generated API client
 * gets real types (frontend AGENTS.md).
 */

/** Owner contact block of the ficha (§4.1). */
export class PropertyOwnerViewDto {
  @ApiProperty({ type: String, nullable: true, required: false })
  name: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  address: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  city: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  state: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  postalCode: string | null;
}

/** Community block (§4.2); `accessCode` is restricted data (§4.5). */
export class PropertyCommunityViewDto {
  @ApiProperty({ type: String, nullable: true, required: false })
  name: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description: 'Código de acceso a la comunidad (§4.2, acceso restringido)',
  })
  accessCode: string | null;
}

/** One property ficha (§4.2), as the list and the update answer it. */
export class PropertyViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: PropertyOwnerViewDto })
  owner: PropertyOwnerViewDto;

  @ApiProperty()
  addressLine: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  postalCode: string | null;

  @ApiProperty({ enum: PropertyOccupancy, description: 'Ocupación (§4.2)' })
  occupancy: PropertyOccupancy;

  @ApiProperty({ type: PropertyCommunityViewDto })
  community: PropertyCommunityViewDto;

  @ApiProperty({ type: String, nullable: true, required: false })
  entryInstructions: string | null;

  @ApiProperty({ description: 'Autorización para ingresar sin inquilino presente (§4.2)' })
  allowUnattendedEntry: boolean;

  @ApiProperty({ type: String, nullable: true, required: false })
  petsInfo: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  otherInstructions: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

/** One tenant link on a property (§4.3); operational data any active
 * member maintains (Etapa 2 §2.2). */
export class PropertyTenantViewDto {
  @ApiProperty({ format: 'uuid', description: 'Id del tenant de la cuenta' })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Id del vínculo propiedad↔inquilino' })
  linkId: string;

  @ApiProperty({ enum: PropertyTenantKind, description: 'owner o tenant (§4.3)' })
  kind: PropertyTenantKind;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  phones: string[];

  @ApiProperty({ type: String, nullable: true, required: false })
  address: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Franjas disponibles para la visita' })
  availability: string | null;
}

/** Property detail: the ficha plus its tenants. */
export class PropertyDetailViewDto extends PropertyViewDto {
  @ApiProperty({ type: [PropertyTenantViewDto] })
  tenants: PropertyTenantViewDto[];
}

/** Result of adding a tenant; `accessIssued` reports whether the limited
 * access link was emailed (§4.3). */
export class TenantAccessResultViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  email: string | null;

  @ApiProperty({ description: 'Se envió el enlace de acceso limitado por correo (§4.3)' })
  accessIssued: boolean;
}

/** Result of editing a tenant (`UpdateTenantDto`: no email, no kind). */
export class TenantUpdateResultViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  phones: string[];
}
