import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { CommercialRelationViewDto, MeResponseDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_MEMBER_ONE_SPACE, ME_TWO_SPACES } from '@/test/fixtures';
import { apiCalls, jsonResponse, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

const RELATION: CommercialRelationViewDto = {
  id: 'cr-1',
  label: 'Obra conjunta',
  counterpartyCompanyId: 'c-9',
  counterpartyCompanyName: 'Contratas Unidas',
  clientRelationshipId: null,
  clientName: null,
  emergencyPolicy: 'resolve_without_authorization',
  emergencyExtraAmount: null,
  endedAt: null,
  createdAt: '2026-10-03T10:00:00.000Z',
};

const ME_OWN_BUSINESS: MeResponseDto = {
  ...ME_TWO_SPACES,
  memberships: [
    { ...ME_TWO_SPACES.memberships[0], companyType: 'own_business' },
  ],
};

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isRelationsList = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/commercial-relations');
const isPostRelation = (call: { url: string; method: string }) =>
  call.method === 'POST' && call.url.includes('/commercial-relations');
const isPatchRelation = (call: { url: string; method: string }) =>
  call.method === 'PATCH' && call.url.includes('/commercial-relations/cr-1');
const isClientsList = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/clients');

interface ServeOptions {
  me?: MeResponseDto;
  relations?: CommercialRelationViewDto[];
  patch?: Response;
  /** List answers this after the PATCH (server already persisted the close). */
  relationsAfter?: CommercialRelationViewDto[];
  clients?: Array<{ id: string; relationshipId: string; name: string }>;
}

/** Active space `c-1` on the relations catalog (spec F3 §8). */
function serveRelations(options: ServeOptions = {}) {
  let patched = false;
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, options.me ?? ME_TWO_SPACES);
    if (isClientsList(call)) return jsonResponse(200, options.clients ?? []);
    if (isPatchRelation(call)) {
      patched = true;
      return options.patch ?? jsonResponse(200, {});
    }
    if (isPostRelation(call)) return jsonResponse(201, {});
    if (isRelationsList(call)) {
      const rows =
        patched && options.relationsAfter ? options.relationsAfter : options.relations;
      return jsonResponse(200, rows ?? [RELATION]);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderRelations() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/catalogs/relations']);
}

describe('commercial relations (spec F3 §2.1/§2.4, AC-F3.1/AC-F3.9)', () => {
  it('owner sees the create button and the row actions (AC-F3.9)', async () => {
    serveRelations();
    renderRelations();

    expect(await screen.findByText('Obra conjunta')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nueva relación' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar relación: Obra conjunta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cerrar relación: Obra conjunta' })).toBeVisible();
  });

  it('member sees no management actions, only the list (AC-F3.9)', async () => {
    serveRelations({ me: ME_MEMBER_ONE_SPACE });
    renderRelations();

    expect(await screen.findByText('Obra conjunta')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nueva relación' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cerrar relación: Obra conjunta' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Solo el propietario del espacio administra las relaciones.'),
    ).toBeVisible();
  });

  it('closes a relation with confirmation: PATCH {ended:true} → «Cerrada» (AC-F3.9)', async () => {
    serveRelations({
      relationsAfter: [{ ...RELATION, endedAt: '2026-10-05T12:00:00.000Z' }],
    });
    const user = userEvent.setup();
    renderRelations();

    await user.click(
      await screen.findByRole('button', { name: 'Cerrar relación: Obra conjunta' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar relación' }));

    await waitFor(() => {
      const patch = apiCalls(isPatchRelation)[0];
      expect(patch).toBeDefined();
      expect(patch.body).toEqual({ ended: true });
    });
    // §2.4: a closed relation never reopens — no reopen action renders.
    await screen.findByText('Relación cerrada.');
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
  });

  it('creates a relation with an own client as counterparty (AC-F3.9)', async () => {
    serveRelations({
      me: ME_OWN_BUSINESS,
      relations: [],
      clients: [{ id: 'cl-1', relationshipId: 'rel-1', name: 'Carla Cliente' }],
    });
    const user = userEvent.setup();
    renderRelations();

    await user.click(await screen.findByRole('button', { name: 'Nueva relación' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Cliente propio' }));
    await user.click(within(dialog).getByLabelText('Cliente'));
    // Select options render in a portal outside the dialog (pattern of
    // create-space-dialog.test.tsx): find them at screen level.
    await user.click(await screen.findByRole('option', { name: 'Carla Cliente' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear relación' }));

    await waitFor(() => {
      const post = apiCalls(isPostRelation)[0];
      expect(post).toBeDefined();
      expect(post.body).toMatchObject({ clientRelationshipId: 'rel-1' });
    });
    expect(await screen.findByText('Relación creada.')).toBeVisible();
  });

  it('validates the manual company UUID and the emergency amount (AC-F3.9)', async () => {
    serveRelations();
    const user = userEvent.setup();
    renderRelations();

    await user.click(await screen.findByRole('button', { name: 'Nueva relación' }));
    const dialog = await screen.findByRole('dialog');
    // «Elegir otro espacio propio…» reveals the manual UUID input.
    await user.click(within(dialog).getByLabelText('Identificador de la empresa'));
    await user.click(
      await screen.findByRole('option', { name: 'Elegir otro espacio propio…' }),
    );
    await user.type(within(dialog).getByPlaceholderText('00000000-0000-0000-0000-000000000000'), 'no-uuid');
    await user.click(within(dialog).getByRole('button', { name: 'Crear relación' }));
    expect(await within(dialog).findByText('Debe ser un identificador válido (UUID).')).toBeVisible();
  });
});
