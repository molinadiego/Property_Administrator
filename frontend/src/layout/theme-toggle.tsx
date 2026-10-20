import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/theme-provider';

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/** Cycles system → light → dark, applying the theme instantly (AC-F0.7). */
export function ThemeToggle() {
  const { t } = useTranslation('theme');
  const { mode, toggle } = useTheme();
  const Icon = ICONS[mode];
  const label = t('toggle', { mode: t(`mode.${mode}`) });

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label}>
      <Icon aria-hidden="true" />
    </Button>
  );
}
