import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PropertyViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, PROPERTY_P1 } from '@/test/fixtures';
import { jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

/** Shapes mirror the generated client DTOs (spec F3 §8). */
const propertyFixture = (over: Partial<PropertyViewDto> = {}): PropertyViewDto => ({
  ...PROPERTY_P1,
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isPropertiesList = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties');

/** Active space `c-1`; the property list answers per test (spec F3 §8). */
function servePropertiesList(options: { properties?: PropertyViewDto[]; error?: Response } = {}) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (isPropertiesList(call) && !call.url.includes('/properties/p-')) {
      return options.error ?? jsonResponse(200, options.properties ?? []);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderProperties() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/catalogs/properties']);
}

describe('property list (spec F3 §2.1, AC-F3.1…AC-F3.3)', () => {
  it('lists the fichas with address, city and occupancy badge', async () => {
    servePropertiesList({
      properties: [
        propertyFixture({ id: 'p-1', occupancy: 'occupied' }),
        propertyFixture({ id: 'p-2', addressLine: 'Av. Siempre Viva 742', occupancy: 'vacant' }),
      ],
    });
    renderProperties();

    expect(await screen.findByText('Calle Falsa 123')).toBeVisible();
    expect(screen.getByText('Av. Siempre Viva 742')).toBeVisible();
    expect(screen.getByText('Ocupada')).toBeVisible();
    expect(screen.getByText('Vacante')).toBeVisible();
  });

  it('shows the empty state when the space has no properties', async () => {
    servePropertiesList({ properties: [] });
    renderProperties();

    expect(
      await screen.findByText('Aún no hay propiedades registradas.'),
    ).toBeVisible();
  });

  it('shows the RFC 7807 detail on error and offers retry (AC-F3.2)', async () => {
    servePropertiesList({
      error: problemJson(403, 'No tienes acceso a este espacio.'),
    });
    renderProperties();

    expect(await screen.findByText('No tienes acceso a este espacio.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  it('opens the detail from a property row', async () => {
    servePropertiesList({ properties: [propertyFixture()] });
    const user = userEvent.setup();
    const { router } = renderProperties();

    await user.click(await screen.findByRole('link', { name: 'Ver propiedad: Calle Falsa 123' }));
    await waitFor(() =>
      expect(currentPath(router)).toBe('/app/catalogs/properties/p-1'),
    );
  });

  it('«Nueva propiedad» opens the creation form', async () => {
    servePropertiesList({ properties: [propertyFixture()] });
    const user = userEvent.setup();
    const { router } = renderProperties();

    await user.click(await screen.findByRole('link', { name: 'Nueva propiedad' }));
    await waitFor(() =>
      expect(currentPath(router)).toBe('/app/catalogs/properties/new'),
    );
  });
});
