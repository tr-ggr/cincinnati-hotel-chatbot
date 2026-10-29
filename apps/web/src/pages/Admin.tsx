import { useEffect, useState } from 'react';
import { formatClockTime, getDocument, useDocumentTitle, useStatsStream, type DocumentInfo } from '../lib';
import { CategoryChart, StatCard, UploadCard } from '../components/admin';
import { BackLink, FlapText } from '../components/ui';

export default function Admin() {
  useDocumentTitle('Admin');
  const { stats, mode, error, refresh } = useStatsStream();
  // Fallback for the knowledge-base card if the stats snapshot never arrives; snapshots win once they do.
  const [fetchedDoc, setFetchedDoc] = useState<DocumentInfo | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getDocument().then(
      (d) => active && setFetchedDoc(d),
      () => active && setFetchedDoc((d) => (d === undefined ? null : d)),
    );
    return () => {
      active = false;
    };
  }, []);

  const activeDocument = stats ? stats.activeDocument : fetchedDoc;

  const unansweredShare =
    stats && stats.totalQuestions > 0
      ? `${Math.round((stats.unansweredQuestions / stats.totalQuestions) * 100)}% of questions`
      : undefined;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b-2 border-rule-strong pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <BackLink />
          <div className="min-w-0">
            <h1>
              <FlapText text="Admin dashboard" className="text-[1.5rem] sm:text-[2rem]" />
            </h1>
            <p className="mt-1.5 text-sm text-dim">Cincinnati Hotel · guest questions as they arrive</p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
          {mode === 'polling' && (
            <p role="status" className="text-dim">
              Live updates paused, refreshing every 10&nbsp;s
            </p>
          )}
          {stats && (
            <p className="text-muted tabular-nums">
              Updated <time dateTime={stats.generatedAt}>{formatClockTime(stats.generatedAt)}</time>
            </p>
          )}
        </div>
      </header>

      {error && !stats && (
        <p role="alert" className="mt-5 rounded-slat border border-stop/50 bg-stop/10 p-3 text-sm text-stop">
          Could not load stats: {error.message}
        </p>
      )}

      <section
        aria-label="Key numbers"
        className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-slat border border-rule bg-rule lg:grid-cols-4"
      >
        <StatCard label="Total sessions" value={stats?.totalSessions ?? null} />
        <StatCard label="Questions asked" value={stats?.totalQuestions ?? null} />
        <StatCard label="Unanswered" value={stats?.unansweredQuestions ?? null} sublabel={unansweredShare} />
        <StatCard label="Leads captured" value={stats?.totalLeads ?? null} />
      </section>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <CategoryChart data={stats?.byCategory ?? null} />
        <UploadCard
          activeDocument={activeDocument}
          pendingDocument={stats?.pendingDocument ?? null}
          onUploaded={refresh}
        />
      </div>
    </main>
  );
}
