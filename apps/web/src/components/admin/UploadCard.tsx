import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { CircleAlert, FileText } from 'lucide-react';
import { Badge, Button, Skeleton } from '../ui';
import { cn } from '../../lib/cn';
import { formatBytes, formatRelativeTime } from '../../lib/format';
import { isApiError, uploadDocument, type DocumentInfo } from '../../lib/api';

const MAX_BYTES = 25 * 1024 * 1024;

export interface UploadCardProps {
  /** undefined = still loading, null = no document. */
  document: DocumentInfo | null | undefined;
  onUploaded: () => void | Promise<void>;
}

type Phase = 'idle' | 'uploading' | 'processing';

function validate(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Only PDF files are supported. Please choose a .pdf file.';
  if (file.size > MAX_BYTES) return `That file is ${formatBytes(file.size)}. The maximum size is 25 MB.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

function friendly(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'FILE_TOO_LARGE' || e.status === 413) return 'That file is too large. The maximum size is 25 MB.';
    return e.message;
  }
  return 'Upload failed. Please try again.';
}

function StatusPill({ status }: { status: DocumentInfo['status'] }) {
  if (status === 'ready') return <Badge tone="success">Ready</Badge>;
  if (status === 'failed') return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="accent">Processing</Badge>;
}

export function UploadCard({ document: doc, onUploaded }: UploadCardProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== 'idle';

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (phase !== 'processing') return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const submit = useCallback(
    async (file: File | undefined) => {
      if (!file || busy) return;
      const problem = validate(file);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setPhase('uploading');
      const switchTimer = setTimeout(() => setPhase((p) => (p === 'uploading' ? 'processing' : p)), 1500);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        await uploadDocument(file, { signal: ctrl.signal });
        await onUploaded();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setError(friendly(e));
      } finally {
        clearTimeout(switchTimer);
        setPhase('idle');
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [busy, onUploaded],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void submit(e.dataTransfer.files[0]);
  };

  const replacing = !!doc;

  return (
    <section aria-labelledby="knowledge-base" className="rounded-slat border border-rule bg-slat">
      <div className="border-b-2 border-rule-strong px-4 py-4 sm:px-5">
        <h2 id="knowledge-base" className="font-display text-xl font-extrabold uppercase tracking-wide text-flap">
          Knowledge base
        </h2>
      </div>

      <div className="border-b border-rule px-4 py-4 sm:px-5">
        {doc === undefined ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : doc ? (
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-dim" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="min-w-0 max-w-full truncate font-semibold text-flap" title={doc.filename}>
                  {doc.filename}
                </p>
                <StatusPill status={doc.status} />
              </div>
              <p className="mt-1.5 text-sm text-dim">
                {doc.pageCount ?? '-'} pages · {doc.chunkCount ?? '-'} chunks · {formatBytes(doc.sizeBytes)} · uploaded{' '}
                {formatRelativeTime(doc.uploadedAt)}
              </p>
              {doc.status === 'failed' && doc.error && <p className="mt-1.5 text-sm text-stop">{doc.error}</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-dim">
            <span className="font-semibold text-signal">No document uploaded yet.</span> The chatbot cannot answer until you
            upload one.
          </p>
        )}
      </div>

      <div className="p-4 sm:p-5">
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
          <input
            ref={inputRef}
            id="pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => void submit(e.target.files?.[0])}
          />
          <Button variant={replacing ? 'secondary' : 'primary'} loading={busy} onClick={() => inputRef.current?.click()}>
            {phase === 'uploading'
              ? 'Uploading…'
              : phase === 'processing'
                ? 'Reading the guide…'
                : replacing
                  ? 'Replace PDF'
                  : 'Choose PDF'}
          </Button>
        </div>
        <p className="mt-2.5 text-pretty text-sm text-muted" aria-live="polite">
          {phase === 'processing'
            ? `This can take up to 30 seconds. ${elapsed}s elapsed`
            : replacing
              ? 'Replacing the document switches the chatbot to the new content. PDF only, up to 25 MB.'
              : 'PDF only, up to 25 MB.'}
        </p>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-slat border border-stop/50 bg-stop/10 p-3 text-sm text-stop">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </section>
  );
}
