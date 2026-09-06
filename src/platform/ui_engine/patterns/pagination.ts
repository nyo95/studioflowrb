"use client";

import { useState } from "react";
import { buildPageMeta, calcOffset } from "@platform/utilities/pagination";

/** Pagination mechanics only. Apps supply filtered totals, scope and page size. */
export function usePagination(total: number, pageSize: number, scope: string) {
  const [state, setState] = useState({ scope, page: 1 });
  const pageCount = Math.max(1, buildPageMeta(1, pageSize, total).pageCount);
  const page = state.scope === scope ? Math.min(state.page, pageCount) : 1;
  if (state.scope !== scope || state.page !== page) setState({ scope, page });
  return { page, pageCount, offset: calcOffset(page, pageSize), setPage: (next: number) => setState({ scope, page: Math.max(1, Math.min(next, pageCount)) }) };
}
