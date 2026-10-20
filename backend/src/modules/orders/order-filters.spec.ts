import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Prisma } from '../../generated/prisma/client';
import { OrdersQueryDto } from './dto/orders.query.dto';
import {
  ASSIGNMENT_STATUS_VALUES,
  buildOrderListWhere,
  ORDER_STATUS_VALUES,
  parseStatusFilter,
} from './order-filters';

/** Validates a query object exactly as the ValidationPipe does (BE-1 §8). */
const parseQuery = async (query: Record<string, unknown>) => {
  const dto = plainToInstance(OrdersQueryDto, query);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
};

const errorMessages = (errors: Awaited<ReturnType<typeof validate>>): string[] =>
  errors.flatMap((e) => Object.values(e.constraints ?? {}));

describe('order filters parsing (BE-1 §4)', () => {
  it('splits and trims a comma-separated status list', () => {
    expect(parseStatusFilter('open,in_progress')).toEqual(['open', 'in_progress']);
    expect(parseStatusFilter(' open , in_progress ')).toEqual(['open', 'in_progress']);
  });

  it('accepts repeated params (array form) and splits each item', () => {
    expect(parseStatusFilter(['open', 'in_progress,completed'])).toEqual([
      'open',
      'in_progress',
      'completed',
    ]);
  });

  it('returns undefined when the param is absent or null (no filter)', () => {
    expect(parseStatusFilter(undefined)).toBeUndefined();
    expect(parseStatusFilter(null)).toBeUndefined();
  });

  it("coerces the empty value to [''] so validation rejects it (AC-BE1.4)", () => {
    expect(parseStatusFilter('')).toEqual(['']);
  });

  it('parses a valid status list through the DTO', async () => {
    const { dto, errors } = await parseQuery({ status: 'open, in_progress, completed' });
    expect(errors).toHaveLength(0);
    expect(dto.status).toEqual(['open', 'in_progress', 'completed']);
  });

  it('rejects the retired `assigned` status alone or inside a list (BE-2 AC-BE2.2/AC-BE2.3)', async () => {
    for (const value of ['assigned', 'open,assigned']) {
      const { errors } = await parseQuery({ status: value });
      expect(errors).toHaveLength(1);
      const message = errorMessages(errors)[0];
      expect(message).toContain('status');
      expect(message).toContain('in_progress');
      expect(message).not.toContain('assigned');
    }
  });

  it('accepts every §20.1 order status and the two assignment filters', async () => {
    const { errors } = await parseQuery({
      status: [...ORDER_STATUS_VALUES].join(','),
      assignment_status: ASSIGNMENT_STATUS_VALUES[0],
    });
    expect(errors).toHaveLength(0);
    const accepted = await parseQuery({ assignment_status: 'accepted' });
    expect(accepted.errors).toHaveLength(0);
  });

  it('rejects an unknown status with an actionable message (B1)', async () => {
    const { errors } = await parseQuery({ status: 'foo' });
    expect(errors).toHaveLength(1);
    const message = errorMessages(errors)[0];
    expect(message).toContain('status');
    expect(message).toContain('open');
    expect(message).toContain('in_progress');
  });

  it('rejects the empty status (B1, never silently ignored)', async () => {
    const { errors } = await parseQuery({ status: '' });
    expect(errors).toHaveLength(1);
    expect(errorMessages(errors)[0]).toContain('status');
  });

  it("rejects a list containing an invalid member ('open,foo')", async () => {
    const { errors } = await parseQuery({ status: 'open,foo' });
    expect(errors).toHaveLength(1);
    const message = errorMessages(errors)[0];
    expect(message).toContain('status');
    expect(message).toContain('cancelled');
  });

  it('accepts assignment_status pending|accepted and rejects the rest (B2)', async () => {
    for (const value of ['pending', 'accepted']) {
      const { errors } = await parseQuery({ assignment_status: value });
      expect(errors).toHaveLength(0);
    }
    for (const value of ['rejected', 'revoked', '', 'pending,accepted']) {
      const { errors } = await parseQuery({ assignment_status: value });
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('ignores unknown query params at the DTO level (whitelist, §11)', async () => {
    const { errors } = await parseQuery({ foo: '1' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('foo');
  });

  it('leaves both filters undefined when the query is empty (AC-BE1.6)', async () => {
    const { dto, errors } = await parseQuery({});
    expect(errors).toHaveLength(0);
    expect(dto.status).toBeUndefined();
    expect(dto.assignment_status).toBeUndefined();
  });
});

describe('buildOrderListWhere (BE-1 §5)', () => {
  const membershipIds = ['membership-1', 'membership-2'];
  const visibility: Prisma.OrderWhereInput = {
    OR: [
      { companyId: 'company-1' },
      {
        jobs: {
          some: {
            assignments: {
              some: {
                assigneeMembershipId: { in: membershipIds },
                status: { in: ['pending', 'accepted'] },
              },
            },
          },
        },
      },
    ],
  };

  it('returns the §2.12 visibility clause untouched when there are no filters (AC-BE1.6)', () => {
    expect(buildOrderListWhere(visibility, {}, membershipIds)).toBe(visibility);
    expect(buildOrderListWhere(visibility, { status: [] }, membershipIds)).toBe(visibility);
  });

  it('ANDs a status clause on top of the visibility clause without mutating it', () => {
    const original = JSON.parse(JSON.stringify(visibility)) as Prisma.OrderWhereInput;
    const where = buildOrderListWhere(visibility, { status: ['open', 'in_progress'] }, membershipIds);
    expect(where).toEqual({
      AND: [visibility, { status: { in: ['open', 'in_progress'] } }],
    });
    expect(visibility).toEqual(original);
  });

  it("ANDs an assignment_status clause scoped to the caller's memberships (B3)", () => {
    const where = buildOrderListWhere(visibility, { assignment_status: 'pending' }, membershipIds);
    expect(where).toEqual({
      AND: [
        visibility,
        {
          jobs: {
            some: {
              assignments: {
                some: {
                  assigneeMembershipId: { in: membershipIds },
                  status: 'pending',
                },
              },
            },
          },
        },
      ],
    });
  });

  it('combines both filters with AND, visibility first (AC-BE1.3)', () => {
    const where = buildOrderListWhere(
      visibility,
      { status: ['open'], assignment_status: 'accepted' },
      membershipIds,
    );
    const and = where.AND as Prisma.OrderWhereInput[];
    expect(and).toHaveLength(3);
    expect(and[0]).toEqual(visibility);
    expect(and[1]).toEqual({ status: { in: ['open'] } });
    expect(and[2]).toMatchObject({
      jobs: { some: { assignments: { some: { status: 'accepted' } } } },
    });
  });
});
