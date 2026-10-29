import { FlapText, Skeleton } from '../ui';
import { cn } from '../../lib/cn';
import type { CategoryCount } from '../../lib/api';
import { CATEGORIES } from '../../lib/categories';
import { useChangeTick } from './useChangeTick';

const SEGMENTS = 16;

export interface CategoryChartProps {
  data: CategoryCount[] | null;
  totalQuestions: number;
}

function BoardRow({ category, count, max }: { category: string; count: number; max: number }) {
  const tick = useChangeTick(count);
  const lit = max > 0 ? Math.round((count / max) * SEGMENTS) : 0;
  const filled = count > 0 ? Math.max(lit, 1) : 0;
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3 last:border-b-0 sm:grid-cols-[11.5rem_minmax(0,1fr)_auto] sm:px-5">
      {tick > 0 && <span key={tick} className="animate-row-lit pointer-events-none absolute inset-0" />}
      <span className={cn('truncate text-sm font-medium sm:text-base', count > 0 ? 'text-flap' : 'text-muted')}>
        {category}
      </span>
      <span className="col-span-2 row-start-2 flex gap-[3px] sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn('h-3.5 flex-1 rounded-[1px]', i < filled ? 'bg-signal' : 'bg-slat-2')}
          />
        ))}
      </span>
      <FlapText
        text={String(count)}
        a11y="inline"
        minCells={3}
        className="col-start-2 row-start-1 text-lg sm:col-start-3"
      />
    </li>
  );
}

export function CategoryChart({ data, totalQuestions }: CategoryChartProps) {
  const rows: CategoryCount[] | null = data
    ? CATEGORIES.map((category) => ({ category, count: data.find((d) => d.category === category)?.count ?? 0 })).sort(
        (a, b) => b.count - a.count,
      )
    : null;
  const max = rows ? Math.max(0, ...rows.map((r) => r.count)) : 0;

  return (
    <section aria-labelledby="by-category" className="rounded-slat border border-rule bg-slat">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-rule-strong px-4 py-4 sm:px-5">
        <h2 id="by-category" className="font-display text-xl font-extrabold uppercase tracking-wide text-flap">
          Questions by category
        </h2>
        <p className="text-sm text-dim">
          {rows === null ? '\u00a0' : totalQuestions === 0 ? 'No questions yet. Rows light up as guests start chatting.' : `${totalQuestions.toLocaleString()} questions in total`}
        </p>
      </div>

      {rows === null ? (
        <ul aria-hidden="true">
          {CATEGORIES.map((c) => (
            <li key={c} className="border-b border-rule px-4 py-3.5 last:border-b-0 sm:px-5">
              <Skeleton className="h-5 w-full" />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul aria-hidden="true">
            {rows.map((r) => (
              <BoardRow key={r.category} category={r.category} count={r.count} max={max} />
            ))}
          </ul>
          <table className="sr-only">
            <caption>Questions asked by category</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Questions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category}>
                  <th scope="row">{r.category}</th>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
