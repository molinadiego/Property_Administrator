import { useId, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon } from 'lucide-react';

import { ApiError } from '@/api/errors';
import { ErrorBanner, formatDate } from '@/catalogs/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildFileUrl,
  downloadFile,
  formatFileSize,
  type FileRowData,
} from '@/history/files-actions';
import { useUploadJobFile, useUploadOrderFile } from '@/history/queries';
import { inferFileKind, UPLOAD_ACCEPT, validateUploadFile } from '@/history/upload-rules';
import { cn } from '@/lib/utils';

/**
 * Shared file UI (spec F5 §2.5, §5): rows with a server-checked download
 * (F5-D7, banner on 404/503) and the upload control (PC and mobile pickers,
 * local mirror validation, RFC 7807 banner on 415/422). No delete action
 * exists anywhere (F5-D8, §1.1.8).
 */

/** Visible rows of one list; `retired` rows (`deletedAt`) get no download. */
export function FileList({
  files,
  companyId,
  emptyText,
}: {
  files: readonly FileRowData[];
  companyId: string;
  emptyText?: string;
}) {
  const { t } = useTranslation(['history', 'common']);
  const [downloadError, setDownloadError] = useState<unknown>(null);

  const onDownload = async (file: FileRowData) => {
    try {
      await downloadFile(buildFileUrl(companyId, file.id), file.filename);
      setDownloadError(null);
    } catch (cause) {
      setDownloadError(cause);
    }
  };

  if (files.length === 0 && emptyText) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  const failureText =
    downloadError instanceof ApiError && downloadError.status === 404
      ? t('history:files.downloadNoAccess')
      : t('history:files.downloadFailed');

  return (
    <div className="space-y-2">
      <ul className="space-y-2" role="list">
        {files.map((file) => {
          const isPhoto = file.kind === 'photo';
          return (
            <li
              key={file.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border p-3"
            >
              <span className="text-muted-foreground" aria-hidden="true">
                {isPhoto ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
              </span>
              <span className="sr-only">
                {isPhoto ? t('history:files.kindPhoto') : t('history:files.kindDocument')}
              </span>
              <span className="min-w-0 flex-1 basis-40 truncate text-sm" title={file.filename}>
                {file.filename}
              </span>
              <span className="text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
              <span className="text-xs text-muted-foreground">{formatDate(file.createdAt)}</span>
              {file.deletedAt !== null ? (
                <Badge variant="secondary">{t('history:files.retired')}</Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onDownload(file)}
                  aria-label={t('history:files.downloadAria', { filename: file.filename })}
                >
                  {t('history:files.download')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {downloadError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {failureText}
        </p>
      ) : null}
    </div>
  );
}

export type UploadTarget =
  | { kind: 'order'; orderId: string }
  | { kind: 'job'; orderId: string; jobId: string };

/**
 * Upload control (F5-D5): a hidden `accept`-filtered input behind a
 * button-styled label (focus ring via `peer`), the local rules mirror first
 * (F5 §6) and then the mutation — the server re-validates (§16.1).
 */
export function UploadControl({
  companyId,
  target,
}: {
  companyId: string;
  target: UploadTarget;
}) {
  const { t } = useTranslation(['history', 'common']);
  const inputId = useId();
  const orderUpload = useUploadOrderFile(companyId, target.orderId);
  const jobUpload = useUploadJobFile(companyId, target.orderId);
  const upload = target.kind === 'order' ? orderUpload : jobUpload;
  const [localError, setLocalError] = useState<string | null>(null);

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again re-fires `change`.
    event.target.value = '';
    if (!file) return;
    const problem = validateUploadFile({ type: file.type, size: file.size });
    if (problem) {
      setLocalError(t(`history:files.validation.${problem}`));
      return;
    }
    setLocalError(null);
    const kind = inferFileKind(file.type);
    if (target.kind === 'order') orderUpload.mutate({ file, kind });
    else jobUpload.mutate({ jobId: target.jobId, file, kind });
  };

  const isPending = upload.isPending;

  return (
    <div className="space-y-1.5">
      <input
        id={inputId}
        type="file"
        className="peer sr-only"
        accept={UPLOAD_ACCEPT}
        onChange={handlePick}
        disabled={isPending}
        aria-describedby={localError ? `${inputId}-error` : undefined}
      />
      <Button
        asChild
        variant="outline"
        size="sm"
        className={cn(isPending && 'pointer-events-none opacity-60')}
      >
        <label
          htmlFor={inputId}
          className="cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2"
          aria-busy={isPending || undefined}
        >
          {isPending ? t('history:files.uploading') : t('history:files.upload')}
        </label>
      </Button>
      {localError ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">
          {localError}
        </p>
      ) : null}
      <ErrorBanner error={upload.error} fallback={t('history:files.uploadFailed')} />
    </div>
  );
}
