import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';

import { mockMatchMedia } from '@/test/setup';

import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const { mode, resolvedTheme, toggle } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
    </div>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe('ThemeProvider', () => {
  it('defaults to the system theme (light when the OS prefers light)', () => {
    renderTheme();
    expect(screen.getByTestId('mode')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies the dark theme when the OS prefers dark', () => {
    mockMatchMedia(true);
    renderTheme();
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('cycles modes, applying and persisting each one instantly (AC-F0.7)', async () => {
    const user = userEvent.setup();
    renderTheme();

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(window.localStorage.getItem('hm.theme')).toBe('light');

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(window.localStorage.getItem('hm.theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('system');
    expect(window.localStorage.getItem('hm.theme')).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('restores the persisted mode on mount', () => {
    window.localStorage.setItem('hm.theme', 'dark');
    renderTheme();
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps working when localStorage is unavailable (spec F0 §11)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    const user = userEvent.setup();
    renderTheme();

    expect(screen.getByTestId('mode')).toHaveTextContent('system');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    // Still applies the theme for the rest of the session.
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
