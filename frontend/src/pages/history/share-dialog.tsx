import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorBanner } from '@/catalogs/ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface ShareOption {
  value: string;
  label: string;
}

/**
 * Share dialog of §7.5 (spec F5 §5): pick an active membership (already
 * shared ones are filtered out by the page) plus an optional ≤2000 note.
 * Dumb dialog: the page owns the mutation, the RFC 7807 banner and the
 * invalidation (F4 §5 pattern).
 */
export function ShareDialog({
  open,
  onOpenChange,
  options,
  isPending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ShareOption[];
  isPending: boolean;
  error: unknown;
  onConfirm: (input: { sharedWithMembershipId: string; note?: string }) => void;
}) {
  const { t } = useTranslation(['history', 'common']);
  const [memberId, setMemberId] = useState('');
  const [note, setNote] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setMemberId('');
      setNote('');
      setMemberError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('history:share.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('history:share.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!memberId) {
              setMemberError(t('history:share.memberRequired'));
              return;
            }
            const trimmed = note.trim();
            onConfirm(
              trimmed ? { sharedWithMembershipId: memberId, note: trimmed } : { sharedWithMembershipId: memberId },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="share-member">{t('history:share.memberLabel')}</Label>
            <Select
              value={memberId}
              onValueChange={(next) => {
                setMemberId(next);
                setMemberError(null);
              }}
            >
              <SelectTrigger
                id="share-member"
                className="w-full"
                aria-invalid={memberError ? true : undefined}
                aria-describedby={memberError ? 'share-member-error' : undefined}
              >
                <SelectValue placeholder={t('history:share.memberPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {memberError ? (
              <p id="share-member-error" role="alert" className="text-sm text-destructive">
                {memberError}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-note">{t('history:share.noteLabel')}</Label>
            <Textarea
              id="share-note"
              maxLength={2000}
              placeholder={t('history:share.notePlaceholder')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <ErrorBanner error={error} fallback={t('history:share.actionFailed')} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('history:share.submitting') : t('history:share.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
