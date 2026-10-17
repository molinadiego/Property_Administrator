import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/enums';

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: MembershipRole, example: MembershipRole.member })
  @IsEnum(MembershipRole)
  role: MembershipRole;
}
