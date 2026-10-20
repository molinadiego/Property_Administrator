import type { MeResponseDto } from '@/api/types';

const joinedAt = '2026-01-15T10:30:00.000Z';

/** `ana@demo.test` in the seed: 2 memberships (property admin + contractor). */
export const ME_TWO_SPACES: MeResponseDto = {
  id: '8f9c2a5e-1c1c-4f6f-9d5b-0a5e2f6a1b01',
  email: 'ana@demo.test',
  name: 'Ana Demo',
  memberships: [
    {
      companyId: 'c-1',
      companyName: 'Gestión Demo',
      companyType: 'property_management',
      role: 'owner',
      joinedAt,
    },
    {
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

export const LOGIN_USER = {
  id: ME_TWO_SPACES.id,
  email: ME_TWO_SPACES.email,
  name: ME_TWO_SPACES.name,
};
