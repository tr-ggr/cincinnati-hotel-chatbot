import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, Skeleton } from '../ui';
import type { CategoryCount } from '../../lib/api';
import { CATEGORIES } from '../../lib/categories';

const AMBER = '#d97706';
const ROW_H = 36;

export interface CategoryChartProps {
  data: CategoryCount[] | null;
  totalQuestions: number;
}

export function CategoryChart({ data, totalQuestions }: CategoryChartProps) {
  const rows: CategoryCount[] | null = data
    ? CATEGORIES.map((category) => ({ category, count: data.find((d) => d.category === category)?.count ?? 0 })).sort(
        (a, b) => b.count - a.count,
      )
    : null;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Questions by category</h2>
      </div>
      <div className="mt-4" style={{ height: CATEGORIES.length * ROW_H }}>
        {rows !== null && totalQuestions === 0 ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-sunken/50 text-center">
            <BarChart3 className="size-7 text-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-ink-soft">No questions yet</p>
            <p className="max-w-xs px-4 text-xs text-muted">Categories will appear here as guests start chatting.</p>
          </div>
        ) : rows === null ? (
          <div className="space-y-2.5" aria-hidden="true">
            {CATEGORIES.map((c) => (
              <Skeleton key={c} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <div aria-hidden="true" className="size-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={8}>
                <XAxis type="number" allowDecimals={false} hide domain={[0, (max: number) => Math.max(max, 1)]} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={160}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={{ fill: '#44403c', fontSize: 13 }}
                />
                <Bar dataKey="count" fill={AMBER} radius={[0, 6, 6, 0]} minPointSize={2} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" style={{ fill: '#1c1917', fontSize: 13, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {rows && (
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
      )}
    </Card>
  );
}
