import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CircleAlert, FileText } from 'lucide-react';
import { Badge, Button, Skeleton } from '../ui';
import { cn } from '../../lib/cn';
import { formatBytes, formatRelativeTime } from '../../lib/format';
import { isApiError, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, uploadDocument, type DocumentInfo } from '../../lib/api';

export interface UploadCardProps {
  /** undefined = still loading, null = no document. */
  activeDocument: DocumentInfo | null | undefined;
  /** The newest upload that is not active yet (processing, or failed), from the stats snapshot. */
  pendingDocument: DocumentInfo | null;
  /** Called once the upload is accepted (202), to pull a fresh snapshot. */
  onUploaded: () => void | Promise<void>;
}

/** Local phases only; "reading the guide" is driven by the server's pendingDocument. */
type Phase = 'idle' | 'confirm' | 'uploading';

function validate(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Only PDF files are supported. Please choose a .pdf file.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${formatBytes(file.size)}. The maximum size is ${MAX_UPLOAD_MB} MB.`;
  }
  if (file.size === 0) return 'That file is empty.';
  return null;
}

function friendly(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'FILE_TOO_LARGE' || e.status === 413) {
      return `That file is too large. The maximum size is ${MAX_UPLOAD_MB} MB.`;
    }
    if (e.code === 'RATE_LIMITED') return 'Too many uploads in a row. Wait a minute and try again.';
    return e.message;
  }
  return 'Upload failed. Please try again.';
}

function StatusPill({ status }: { status: DocumentInfo['status'] }) {
  if (status === 'ready') return <Badge tone="success">Ready</Badge>;
  if (status === 'failed') return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="accent">Processing</Badge>;
}

function DocumentRow({ doc, detail }: { doc: DocumentInfo; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <FileText className="mt-0.5 size-5 shrink-0 text-dim" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="min-w-0 max-w-full truncate font-semibold text-flap" title={doc.filename}>
            {doc.filename}
          </p>
          <StatusPill status={doc.status} />
        </div>
        <p className="mt-1.5 text-sm text-dim">{detail}</p>
      </div>
    </div>
  );
}

export function UploadCard({ activeDocument: doc, pendingDocument: pending, onUploaded }: UploadCardProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirmFile, setConfirmFile] = useState<File | null>(null);
  /** Id of the upload this tab sent; its outcome is read from the snapshots below. */
  const [watchId, setWatchId] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Land keyboard focus on the safe choice when the replace confirmation opens.
  useEffect(() => {
    if (phase === 'confirm') keepRef.current?.focus();
  }, [phase]);

  const processingDoc = pending?.status === 'processing' ? pending : null;
  const failedDoc = pending?.status === 'failed' ? pending : null;
  const watchedReady = watchId !== null && doc?.id === watchId && doc.status === 'ready';
  const watchedFailed = watchId !== null && failedDoc?.id === watchId;
  const uploading = phase === 'uploading';
  // Processing: the server says so, or our accepted upload has not shown up as ready/failed yet.
  const processing = !uploading && (processingDoc !== null || (watchId !== null && !watchedReady && !watchedFailed));
  const busy = uploading || processing;
  const replacing = !!doc;
  // Show an old failure (e.g. after a reload) unless this tab has since moved on to another upload.
  const shownFailure = failedDoc && (watchId === null || watchedFailed) ? failedDoc : null;

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async (file: File) => {
    setPhase('uploading');
    setConfirmFile(null);
    setError(null);
    setNote(null);
    setWatchId(null);
    setLastFile(file);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const accepted = await uploadDocument(file, { signal: ctrl.signal });
      setWatchId(accepted.id);
      void onUploaded();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setNote('Upload cancelled.');
      else setError(friendly(e));
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setPhase('idle');
      resetInput();
    }
  };

  const pick = (file: File | undefined) => {
    if (!file || busy || phase === 'confirm') return;
    const problem = validate(file);
    setNote(null);
    if (problem) {
      setError(problem);
      resetInput();
      return;
    }
    setError(null);
    if (doc) {
      // A live guide is about to be replaced: ask first.
      setConfirmFile(file);
      setPhase('confirm');
      return;
    }
    void upload(file);
  };

  const cancelConfirm = () => {
    setConfirmFile(null);
    setPhase('idle');
    resetInput();
    // The confirm panel unmounts; put focus back on the control that opened it.
    requestAnimationFrame(() => chooseRef.current?.focus());
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  const statusLine = uploading
    ? 'Uploading…'
    : processing
      ? 'Reading the guide… usually under a minute.'
      : watchedReady && doc
        ? `Ready. The chatbot now answers from ${doc.filename}.`
        : note
          ? note
          : replacing
            ? `Replacing the document switches the chatbot to the new content once it is read. PDF only, up to ${MAX_UPLOAD_MB} MB.`
            : `PDF only, up to ${MAX_UPLOAD_MB} MB.`;

  return (
    <section aria-labelledby="knowledge-base" className="rounded-slat border border-rule bg-slat">
      <div className="border-b-2 border-rule-strong px-4 py-4 sm:px-5">
        <h2 id="knowledge-base" className="font-display text-xl font-extrabold uppercase tracking-wide text-flap">
          Knowledge base
        </h2>
      </div>

      <div className="space-y-4 border-b border-rule px-4 py-4 sm:px-5">
        {doc === undefined ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : doc ? (
          <DocumentRow
            doc={doc}
            detail={`${doc.pageCount ?? '-'} pages · ${doc.chunkCount ?? '-'} chunks · ${formatBytes(doc.sizeBytes)} · uploaded ${formatRelativeTime(doc.uploadedAt)}`}
          />
        ) : (
          <p className="text-sm text-dim">
            <span className="font-semibold text-signal">No document uploaded yet.</span> The chatbot cannot answer until you
            upload one.
          </p>
        )}
        {processingDoc && (
          <DocumentRow
            doc={processingDoc}
            detail={`${formatBytes(processingDoc.sizeBytes)} · uploaded ${formatRelativeTime(processingDoc.uploadedAt)}${doc ? ' · the current guide stays live until this one is ready' : ''}`}
          />
        )}
      </div>

      <div className="p-4 sm:p-5">
        {phase === 'confirm' && confirmFile && doc ? (
          <div
            role="group"
            aria-labelledby="replace-confirm-title"
            aria-describedby="replace-confirm-desc"
            className="rounded-slat border border-rule-strong bg-board px-4 py-4"
          >
            <p id="replace-confirm-title" className="text-sm font-semibold text-pretty text-flap">
              Replace {doc.filename} with {confirmFile.name}?
            </p>
            <p id="replace-confirm-desc" className="mt-1.5 text-sm text-pretty text-dim">
              Guests keep getting answers from the current guide until the new one has been read.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button ref={keepRef} variant="ghost" onClick={cancelConfirm}>
                Keep current
              </Button>
              <Button onClick={() => void upload(confirmFile)}>Replace guide</Button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={(e) => {
              // dragleave also fires when the pointer moves onto a child; only reset when it leaves the zone.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={busy ? (e) => e.preventDefault() : onDrop}
            className={cn(
              'flex flex-col gap-3 rounded-slat border bg-board px-4 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between',
              dragging ? 'border-signal bg-signal/10' : 'border-rule',
              busy && 'opacity-80',
            )}
          >
            <p className={cn('text-sm font-semibold', dragging ? 'text-signal' : 'text-flap')}>
              {dragging ? 'Release to upload' : 'Drop a PDF here, or'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {uploading && (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              )}
              <Button
                ref={chooseRef}
                variant={replacing ? 'secondary' : 'primary'}
                loading={busy}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : processing ? 'Reading the guide…' : replacing ? 'Replace PDF' : 'Choose PDF'}
              </Button>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          id="pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={busy || phase === 'confirm'}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <p className="mt-2.5 text-pretty text-sm text-muted" aria-live="polite">
          {statusLine}
        </p>

        {(error || shownFailure) && (
          <div
            role={error || watchedFailed ? 'alert' : undefined}
            className="mt-3 flex items-start gap-2 rounded-slat border border-stop/50 bg-stop/10 p-3 text-sm text-stop"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p>
                {error ??
                  `Couldn't read ${shownFailure?.filename}. ${shownFailure?.error ?? 'Processing failed.'}${doc ? ' The current guide is unchanged.' : ''}`}
              </p>
              {!error && watchedFailed && lastFile && !busy && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => void upload(lastFile)}>
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
