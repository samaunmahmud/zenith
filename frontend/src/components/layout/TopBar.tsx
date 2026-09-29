import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Health } from "../../types";
import { aiLive } from "../../hooks/useHealth";
import { useSymbolSuggest } from "../../hooks/useSymbolSuggest";
import { SuggestList } from "../ui/SuggestList";
import { useTheme } from "../../hooks/useTheme";
import { GitHubIcon, MoonIcon, SearchIcon, SunIcon } from "../ui/Icons";
import { BrandMark } from "./Brand";

interface Props {
  showSearch: boolean;
  busy: boolean;
  health: Health | null;
  onSearch: (ticker: string) => void;
  onHome: () => void;
  page: "record" | "compare" | null;
  onPage: (page: "record" | "compare") => void;
}

/** Whether a live committee can run right now: shown to visitors before they click. */
function StatusPill({ health }: { health: Health | null }) {
  if (!health) return null;
  const live = aiLive(health);
  const title = live
    ? `Live Nemotron runs available ($${health.budget.spentUsd.toFixed(2)} of $${health.budget.maxUsd.toFixed(2)} demo budget used)`
    : "Live AI runs are off (not configured or demo budget used up). Saved decisions are still shown.";
  return (
    <span className={`status-pill ${live ? "is-live" : "is-off"}`} title={title}>
      <i aria-hidden="true" />
      <span>{live ? "Nemotron live" : "Saved decisions only"}</span>
    </span>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function TopBar({ showSearch, busy, health, onSearch, onHome, page, onPage }: Props) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // "/" jumps to the search box, like most data platforms.
  useEffect(() => {
    if (!showSearch) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSearch]);

  const go = (ticker: string) => {
    if (busy) return;
    onSearch(ticker);
    setQ("");
    input.current?.blur();
  };
  const suggest = useSymbolSuggest(q, (m) => go(m.symbol));

  // A company name ("sandisk") that isn't a ticker in the suggestions goes to the best match (SNDK).
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const typed = q.trim().toUpperCase();
    if (!typed) return;
    const best = suggest.matches[0];
    go(best && !suggest.matches.some((m) => m.symbol === typed) ? best.symbol : typed);
  };

  return (
    <header className={`topbar ${showSearch ? "has-search" : ""}`}>
      <div className="container">
        <a className="brand" href="/" aria-label="Zenith home" onClick={(e) => { e.preventDefault(); onHome(); }}>
          <BrandMark />
          <span className="brand-name">Zenith</span> <span className="brand-sub">Investment committee</span>
        </a>
        {showSearch && (
          <form className="top-search" onSubmit={submit} role="search">
            <SearchIcon />
            <input
              ref={input}
              value={q}
              onChange={(e) => { setQ(e.target.value); suggest.setOpen(true); }}
              onKeyDown={suggest.onKeyDown}
              onFocus={() => suggest.setOpen(true)}
              onBlur={() => suggest.setOpen(false)}
              placeholder={busy ? "Committee in session…" : "Search a ticker or company"}
              aria-label="Ticker or company to analyse"
              role="combobox"
              aria-expanded={suggest.shown}
              aria-controls="top-suggest"
              aria-autocomplete="list"
              aria-activedescendant={suggest.active >= 0 ? `top-suggest-${suggest.active}` : undefined}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <kbd aria-hidden="true">/</kbd>
            {suggest.shown && <SuggestList id="top-suggest" matches={suggest.matches} active={suggest.active} onPick={(m) => go(m.symbol)} />}
          </form>
        )}
        <nav className="topnav" aria-label="Main">
          <a href="/?page=compare" aria-current={page === "compare" ? "page" : undefined} onClick={(e) => { e.preventDefault(); onPage("compare"); }}>
            Compare
          </a>
          <a href="/?page=record" aria-current={page === "record" ? "page" : undefined} onClick={(e) => { e.preventDefault(); onPage("record"); }}>
            Track record
          </a>
          <a className="hide-sm" href="/#how" onClick={(e) => { e.preventDefault(); onHome(); setTimeout(() => document.getElementById("how")?.scrollIntoView(), 0); }}>
            How it works
          </a>
          <StatusPill health={health} />
          <ThemeToggle />
          <a className="icon-link" href="https://github.com/samaunmahmud/zenith" target="_blank" rel="noreferrer" aria-label="Source on GitHub">
            <GitHubIcon />
          </a>
        </nav>
      </div>
    </header>
  );
}
