import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { MeResponseDto, PropertyDetailViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

const detailFixture = (
  over: Partial<PropertyDetailViewDto> = {},
): PropertyDetailViewDto => ({
  ...PROPERTY_P1,
  entryInstructions: 'Timbre azul, portería 24h.',
  allowUnattendedEntry: true,
  community: { name: 'Residencial Los Álamos', accessCode: '4321' },
  tenants: [
    {
      id: 't-1',
      linkId: 'l-1',
      kind: 'tenant',
      name: 'Inquilino Uno',
      phones: ['555-0001', '555-0002'],
      address: null,
      availability: 'Tardes',
    },
  ],
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isDetail = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties/p-1');
const isPatchProperty = (call: { url: string; method: string }) =>
  call.method === 'PATCH' && call.url.includes('/companies/c-1/properties/p-1');
const isPostTenant = (call: { url: string; method: string }) =>
  call.method === 'POST' && call.url.includes('/properties/p-1/tenants');

interface ServeOptions {
  me?: MeResponseDto;
  detail?: PropertyDetailViewDto;
  patch?: Response;
  addTenant?: Response;
}

/** Active space `c-1` on the property detail (spec F3 §8). The PATCH answer
 * is reflected in the next GET, mirroring the server's persisted state. */
function serveDetail(options: ServeOptions = {}) {
  let detail = options.detail ?? detailFixture();
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, options.me ?? ME_TWO_SPACES);
    if (isPostTenant(call)) return options.addTenant ?? jsonResponse(201, {});
    if (isPatchProperty(call)) {
      const body = call.body as { addressLine?: string } | undefined;
      if (body?.addressLine) detail = { ...detail, addressLine: body.addressLine };
      return options.patch ?? jsonResponse(200, detail);
    }
    if (isDetail(call)) return jsonResponse(200, detail);
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderDetail() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/catalogs/properties/p-1']);
}

describe('property detail (spec F3 §2.1, AC-F3.4…AC-F3.6)', () => {
  it('shows the official data and the tenants section (AC-F3.5)', async () => {
    serveDetail();
    renderDetail();

    expect(await screen.findByRole('heading', { name: /Calle Falsa 123/ })).toBeVisible();
    expect(screen.getByText('Residencial Los Álamos')).toBeVisible();
    expect(screen.getByText('4321')).toBeVisible();
    expect(screen.getByText('Timbre azul, portería 24h.')).toBeVisible();
    expect(screen.getByText('Inquilino Uno')).toBeVisible();
    expect(screen.getByText('555-0001 · 555-0002')).toBeVisible();
  });

  it('hides the edit action and shows the read-only note outside property_management (AC-F3.4)', async () => {
    const me: MeResponseDto = {
      ...ME_TWO_SPACES,
      memberships: [
        { ...ME_TWO_SPACES.memberships[0], companyType: 'own_business' },
      ],
    };
    serveDetail({ me });
    renderDetail();

    await screen.findByRole('heading', { name: /Calle Falsa 123/ });
    expect(screen.getByText('Solo la administradora de propiedades edita los datos oficiales de la ficha.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument();
  });

  it('edits the ficha from a property_management space and confirms (AC-F3.4)', async () => {
    serveDetail();
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Editar ficha' }));
    // «Dirección» names two inputs (ficha + propietario): scope to the fieldset.
    const addressFieldset = screen.getByRole('group', { name: 'Dirección' });
    const address = within(addressFieldset).getByLabelText('Dirección');
    await user.clear(address);
    await user.type(address, 'Calle Nueva 456');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      const patch = apiCalls(isPatchProperty)[0];
      expect(patch).toBeDefined();
      expect(patch.body).toMatchObject({ addressLine: 'Calle Nueva 456' });
    });
    expect(await screen.findByText('Ficha actualizada.')).toBeVisible();
    // The refetched detail renders the persisted value in the title and the
    // address row (stateful handler mirrors the server).
    expect((await screen.findAllByText('Calle Nueva 456')).length).toBeGreaterThanOrEqual(2);
  });

  it('adds a tenant with the optional email and reports the emailed link (AC-F3.6)', async () => {
    serveDetail({
      addTenant: jsonResponse(201, {
        id: 't-9',
        name: 'Inquilino Nuevo',
        email: 'inquilino@demo.test',
        accessIssued: true,
      }),
    });
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Agregar inquilino' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre y apellido'), 'Inquilino Nuevo');
    await user.type(within(dialog).getByLabelText(/Teléfonos/), '555-0009');
    await user.type(within(dialog).getByLabelText(/Correo electrónico/), 'inquilino@demo.test');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar' }));

    await waitFor(() => {
      const post = apiCalls(isPostTenant)[0];
      expect(post).toBeDefined();
      expect(post.body).toMatchObject({
        kind: 'tenant',
        name: 'Inquilino Nuevo',
        phones: ['555-0009'],
        email: 'inquilino@demo.test',
      });
    });
    expect(
      await screen.findByText(/Inquilino agregado\. Enlace de acceso enviado por correo\./),
    ).toBeVisible();
  });
});
