import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, CircleAlert, Mail, MessageSquare, Users } from 'lucide-react';
import { getDocument, useStatsStream, type DocumentInfo } from '../lib';
import { CategoryChart, LiveBadge, StatCard, UploadCard } from '../components/admin';

export default function Admin() {
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

  const answerRate =
    stats && stats.totalQuestions > 0
      ? `Answer rate ${Math.round(((stats.totalQuestions - stats.unansweredQuestions) / stats.totalQuestions) * 100)}%`
      : undefined;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Admin dashboard</h1>
        </div>
        <LiveBadge mode={mode} />
      </header>

      {error && !stats && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          Could not load stats: {error.message}
        </p>
      )}

      <section aria-label="Key numbers" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total sessions" value={stats?.totalSessions ?? null} icon={Users} />
        <StatCard label="Questions asked" value={stats?.totalQuestions ?? null} icon={MessageSquare} />
        <StatCard label="Unanswered" value={stats?.unansweredQuestions ?? null} icon={CircleAlert} sublabel={answerRate} />
        <StatCard label="Leads captured" value={stats?.totalLeads ?? null} icon={Mail} />
      </section>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <UploadCard document={doc} onUploaded={onUploaded} />
        <CategoryChart data={stats?.byCategory ?? null} totalQuestions={stats?.totalQuestions ?? 0} />
      </div>
    </main>
  );
}
