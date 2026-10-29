import { useCallback, useEffect, useState } from 'react';
import { getDocument, useDocumentTitle, useStatsStream, type DocumentInfo } from '../lib';
import { CategoryChart, StatCard, UploadCard } from '../components/admin';
import { BackLink, FlapText } from '../components/ui';

export default function Admin() {
  useDocumentTitle('Admin');
  const { stats, mode, error, refresh } = useStatsStream();
  const [doc, setDoc] = useState<DocumentInfo | null | undefined>(undefined);

  const refreshDoc = useCallback(async () => {
    try {
      setDoc(await getDocument());
    } catch {
      setDoc((d) => (d === undefined ? null : d));
    }
  }, []);

  useEffect(() => {
    void refreshDoc();
  }, [refreshDoc]);

  // Keep the document card in sync with pushed snapshots.
  useEffect(() => {
    if (stats) setDoc(stats.activeDocument);
  }, [stats]);

  const onUploaded = useCallback(async () => {
    await Promise.all([refreshDoc(), refresh()]);
  }, [refreshDoc, refresh]);

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
        {mode === 'polling' && (
          <p role="status" className="text-sm text-dim">
            Live updates paused, refreshing every 10&nbsp;s
          </p>
        )}
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
        <CategoryChart data={stats?.byCategory ?? null} totalQuestions={stats?.totalQuestions ?? 0} />
        <UploadCard document={doc} onUploaded={onUploaded} />
      </div>
    </main>
  );
}
