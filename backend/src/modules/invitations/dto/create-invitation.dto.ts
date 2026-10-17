import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { InvitationStatus, MembershipRole } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.query.dto';

export class CreateInvitationDto {
  @ApiProperty({ example: 'colaborador@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.member })
  @IsEnum(MembershipRole)
  role: MembershipRole;
}

/**
 * Accepting without a session creates the account: name + password required
 * then. With a session both are ignored — the body may be empty.
 */
export class AcceptInvitationDto {
  @ApiPropertyOptional({ description: 'Requerido solo sin sesión activa', example: 'Rosa Díaz' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ minLength: 8, description: 'Requerido solo sin sesión activa' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;
}

/** Filters for GET /companies/:id/invitations (spec §4.3). */
export class ListInvitationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InvitationStatus, description: 'Filtra por estado' })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}
