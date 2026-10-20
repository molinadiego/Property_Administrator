import type { CompanyMemberDto, InvitationViewDto, MeResponseDto } from '@/api/types';

const joinedAt = '2026-01-15T10:30:00.000Z';

/** `ana@demo.test` in the seed: 2 memberships (property admin + contractor). */
export const ME_TWO_SPACES: MeResponseDto = {
  id: '8f9c2a5e-1c1c-4f6f-9d5b-0a5e2f6a1b01',
  email: 'ana@demo.test',
  name: 'Ana Demo',
  memberships: [
    {
      id: 'mem-ana-c1',
      companyId: 'c-1',
      companyName: 'Gestión Demo',
      companyType: 'property_management',
      role: 'owner',
      joinedAt,
    },
    {
      id: 'mem-ana-c2',
      companyId: 'c-2',
      companyName: 'Taller Carla',
      companyType: 'contractor',
      role: 'member',
      joinedAt,
    },
  ],
};

export const ME_ONE_SPACE: MeResponseDto = {
  ...ME_TWO_SPACES,
  memberships: [ME_TWO_SPACES.memberships[0]],
};

export const ME_NO_SPACES: MeResponseDto = {
  ...ME_TWO_SPACES,
  memberships: [],
};

/** Current user as plain member (no owner-only actions should render). */
export const ME_MEMBER_ONE_SPACE: MeResponseDto = {
  ...ME_TWO_SPACES,
  memberships: [{ ...ME_TWO_SPACES.memberships[0], role: 'member' }],
};

/** Active members of Gestión Demo (c-1): Ana (owner, the only one) + Bob. */
export const MEMBERS_GESTION: CompanyMemberDto[] = [
  {
    membershipId: 'm-ana',
    userId: ME_TWO_SPACES.id,
    name: 'Ana Demo',
    email: 'ana@demo.test',
    role: 'owner',
    joinedAt,
  },
  {
    membershipId: 'm-bob',
    userId: '8f9c2a5e-1c1c-4f6f-9d5b-0a5e2f6a1b02',
    name: 'Bob Contratista',
    email: 'bob@demo.test',
    role: 'member',
    joinedAt,
  },
];

export const PENDING_INVITATION: InvitationViewDto = {
  id: 'inv-1',
  email: 'invitado@demo.test',
  role: 'member',
  status: 'pending',
  expiresAt: '2026-11-01T00:00:00.000Z',
  createdAt: '2026-10-15T10:30:00.000Z',
};

export const LOGIN_USER = {
  id: ME_TWO_SPACES.id,
  email: ME_TWO_SPACES.email,
  name: ME_TWO_SPACES.name,
};
