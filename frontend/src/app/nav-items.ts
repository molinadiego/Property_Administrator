import { ClipboardList, FolderTree, History, LayoutDashboard, ReceiptText, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  /** Exact match for the dashboard index route. */
  end?: boolean;
  /** i18n key inside the `nav` namespace (English key, Spanish text). */
  labelKey: string;
  icon: LucideIcon;
  /** Stage that will deliver the section (placeholders in F0-D6). */
  stage: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/app', end: true, labelKey: 'dashboard', icon: LayoutDashboard, stage: 'F2' },
  { to: '/app/orders', labelKey: 'orders', icon: ClipboardList, stage: 'F4' },
  { to: '/app/catalogs', labelKey: 'catalogs', icon: FolderTree, stage: 'F3' },
  { to: '/app/history', labelKey: 'history', icon: History, stage: 'F5' },
  { to: '/app/billing', labelKey: 'billing', icon: ReceiptText, stage: 'F7' },
  { to: '/app/settings', labelKey: 'settings', icon: Settings, stage: 'F8' },
];
