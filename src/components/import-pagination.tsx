"use client";

import { FormEvent, useMemo, useState } from "react";
import { paginationItems, parsePageInput } from "@/features/imports/bulk-import";

interface ImportPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function ImportPagination({ page, totalPages, total, loading, onPageChange }: ImportPaginationProps) {
  const [input, setInput] = useState(String(page));
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => paginationItems(page, totalPages), [page, totalPages]);

  if (totalPages <= 1) return null;

  function changePage(target:number){setInput(String(target));setError(null);onPageChange(target);}

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result=parsePageInput(input,totalPages);
    if(result.page===null){setError(result.error);return;}
    setError(null);
    changePage(result.page);
  }

  return <div className="pagination version-pagination" aria-label="匯入版本分頁">
    <span>第 {page} / {totalPages} 頁 · 共 {total} 筆</span>
    <nav className="pagination-pages" aria-label="頁碼">
      <button className="button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>上一頁</button>
      <div className="pagination-number-list">
        {items.map((item, index) => item === "ellipsis"
          ? <span className="pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span>
          : <button className={`button pagination-number${item === page ? " active" : ""}`} aria-current={item === page ? "page" : undefined} disabled={loading || item === page} onClick={() => changePage(item)} key={item}>{item}</button>)}
      </div>
      <button className="button" disabled={page >= totalPages || loading} onClick={() => changePage(page + 1)}>下一頁</button>
    </nav>
    <form className="pagination-jump" onSubmit={submit} noValidate>
      <label htmlFor="import-page-jump">前往第</label>
      <input id="import-page-jump" className="control" inputMode="numeric" pattern="[0-9]*" value={input} onChange={(event) => { setInput(event.target.value.trim()); setError(null); }} aria-invalid={Boolean(error)} aria-describedby={error ? "import-page-jump-error" : undefined}/>
      <span>/ {totalPages} 頁</span>
      <button className="button" disabled={loading} type="submit">跳轉</button>
      {error && <span className="pagination-error" id="import-page-jump-error" role="alert">{error}</span>}
    </form>
  </div>;
}
