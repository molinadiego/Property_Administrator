import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import auth from './locales/es/auth.json';
import common from './locales/es/common.json';
import errors from './locales/es/errors.json';
import nav from './locales/es/nav.json';
import spaces from './locales/es/spaces.json';
import theme from './locales/es/theme.json';

/**
 * Spanish-only i18n (frontend_plan D5). Keys are written in English, values in
 * Spanish.
 *
 * Missing-key policy (spec F0):
 * - dev: warn in the console and fall back to the default string (the key is
 *   shown only in dev so it can be spotted and fixed);
 * - production: never render the raw key — fall back to the default string, or
 *   to an empty string when there is none.
 */
const isDev = import.meta.env.DEV;

void i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  resources: {
    es: {
      common,
      auth,
      nav,
      spaces,
      errors,
      theme,
    },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: isDev,
  missingKeyHandler: (_lngs, _ns, key) => {
    console.warn(`[i18n] missing key: ${key}`);
  },
  parseMissingKeyHandler: (key, defaultValue) =>
    defaultValue ?? (isDev ? key : ''),
});

export default i18n;
