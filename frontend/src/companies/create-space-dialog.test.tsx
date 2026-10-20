import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { ME_NO_SPACES, ME_ONE_SPACE } from '@/test/fixtures';
import { currentPath, renderApp } from '@/test/render-app';

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isCreate = (call: { url: string; method: string }) =>
  call.url.endsWith('/companies') && call.method === 'POST';

describe('create space (spec F1 §2, AC-F1.7 / F1-D2)', () => {
  it('offers only the three participant types of §2', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_NO_SPACES);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderApp(['/']);

    await user.click(await screen.findByRole('button', { name: 'Crear espacio' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Tipo de espacio'));

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Administradora de propiedades',
      'Contratista',
      'Profesional independiente',
    ]);
  });

  it('creates the space and enters it (me refetch → F0-D1 flows)', async () => {
    let meCalls = 0;
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, meCalls++ === 0 ? ME_NO_SPACES : ME_ONE_SPACE);
      if (isCreate(call)) {
        return jsonResponse(201, {
          id: 'c-new',
          name: 'Propiedades del Sur',
          type: 'contractor',
          createdAt: '2026-10-20T12:00:00.000Z',
        });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    const { router } = renderApp(['/']);

    await user.click(await screen.findByRole('button', { name: 'Crear espacio' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre del espacio'), 'Propiedades del Sur');
    await user.click(within(dialog).getByLabelText('Tipo de espacio'));
    await user.click(await screen.findByRole('option', { name: 'Contratista' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear espacio' }));

    await waitFor(() => expect(currentPath(router)).toBe('/app'));
    expect(apiCalls(isCreate)[0].body).toEqual({
      name: 'Propiedades del Sur',
      type: 'contractor',
    });
  });

  it('keeps the dialog open and shows the RFC 7807 detail on failure', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_NO_SPACES);
      if (isCreate(call)) return problemJson(422, 'El nombre del espacio es obligatorio.');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderApp(['/']);

    await user.click(await screen.findByRole('button', { name: 'Crear espacio' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre del espacio'), 'X');
    await user.click(within(dialog).getByLabelText('Tipo de espacio'));
    await user.click(await screen.findByRole('option', { name: 'Contratista' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear espacio' }));

    expect(
      await screen.findByText('El nombre del espacio es obligatorio.'),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
