import { useEffect } from 'react';

const BASE = 'Cincinnati Hotel Assistant';

/** Sets the tab title for a route ("Admin · Cincinnati Hotel Assistant"); no argument = the base title. */
export function useDocumentTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · ${BASE}` : BASE;
  }, [page]);
}
