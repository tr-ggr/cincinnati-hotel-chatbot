import { CATEGORIES, type Category } from './categories.js';
import { getActiveDocument, getStatsOverview, toDocumentInfo, type DocumentInfo } from '../db/queries.js';

export interface StatsSnapshot {
  totalSessions: number;
  totalQuestions: number;
  unansweredQuestions: number;
  totalLeads: number;
  byCategory: { category: Category; count: number }[];
  activeDocument: DocumentInfo | null;
  generatedAt: string;
}

export async function getStats(): Promise<StatsSnapshot> {
  const [overview, doc] = await Promise.all([getStatsOverview(), getActiveDocument()]);
  const counts = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
  for (const { category, count } of overview.byCategory) counts.set(category, count);
  const byCategory = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    // desc by count; stable sort keeps CATEGORIES order on ties
    .sort((a, b) => b.count - a.count);
  return {
    totalSessions: overview.totalSessions,
    totalQuestions: overview.totalQuestions,
    unansweredQuestions: overview.unansweredQuestions,
    totalLeads: overview.totalLeads,
    byCategory,
    activeDocument: doc ? toDocumentInfo(doc) : null,
    generatedAt: new Date().toISOString(),
  };
}
