import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from '../../common/tokens';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  phone?: string;
}

/**
 * User accounts (personal identity, shared across companies — spec §2.1).
 * Emails are always normalized to lowercase before read or write.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        phone: input.phone,
      },
    });
  }
}
