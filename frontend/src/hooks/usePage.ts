import { useCallback, useEffect, useState } from "react";

export type Page = "record" | "compare";
const PAGES: Page[] = ["record", "compare"];

function fromUrl(): Page | null {
  const p = new URLSearchParams(window.location.search).get("page");
  return PAGES.includes(p as Page) ? (p as Page) : null;
}

/**
 * Which standalone page is open (/?page=record), kept in the URL so it can be linked to and Back works.
 * null means the normal landing / committee view.
 */
export function usePage(): [Page | null, (page: Page | null) => void] {
  const [page, setPageState] = useState<Page | null>(fromUrl);

  useEffect(() => {
    const onPop = () => setPageState(fromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setPage = useCallback((next: Page | null) => {
    setPageState(next);
    if (next) window.history.pushState(null, "", `?page=${next}`);
  }, []);

  return [page, setPage];
}
