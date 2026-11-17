"use client";

import { useEffect, useRef, useState } from "react";
import type { CompareResult, StreamEvent } from "@/lib/types";
import { Results } from "./components/results";
import { Stages, type StageState } from "./components/stages";

const CHIPS = [
  ["Hair loss", "best hair loss serum"],
  ["Acne", "best acne treatment"],
  ["Anti-aging", "best anti-aging cream"],
] as const;

// ponytail: fixed pseudo-random lengths, rounded so server and client render the same path.
const PLATES = Array.from({ length: 160 }, (_, i) => ({
  x: i * 10 + 5,
  len: Math.round(60 + 72 * Math.sin(i * 0.21) ** 2 + 30 * Math.sin(i * 1.37 + 0.6) ** 2),
}));

function Fringe() {
  return (
    <svg aria-hidden viewBox="0 0 1600 170" preserveAspectRatio="xMidYMin slice" className="block h-24 w-full md:h-40">
      {PLATES.map(({ x, len }, i) => (
        <path
          key={i}
          className="plate"
          style={{ "--i": i } as React.CSSProperties}
          d={`M${x - 2.6} 0L${x + 2.6} 0L${x + 0.4} ${len}L${x - 0.4} ${len}Z`}
          fill="var(--color-foam)"
          fillOpacity={(0.1 + (len - 60) / 400).toFixed(2)}
        />
      ))}
    </svg>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [stages, setStages] = useState<StageState | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const last = useRef<{ query: string; live: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // The hero fills most of a laptop screen, so bring the answer up when it lands.
  useEffect(() => {
    if (!result || !resultsRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    resultsRef.current.focus({ preventScroll: true });
  }, [result]);

  async function run(q: string, live = false) {
    q = q.trim();
    if (!q) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    last.current = { query: q, live };
    setRunning(true);
    setError(null);
    setResult(null);
    setStages({});
    let gotResult = false;
    const handle = (ev: StreamEvent) => {
      if (ev.type === "stage") setStages((s) => ({ ...s, [ev.stage]: { status: ev.status, detail: ev.detail } }));
      else if (ev.type === "result") {
        gotResult = true;
        setResult(ev.result);
      } else if (ev.type === "error") setError(ev.message);
    };
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(live ? { query: q, live: true } : { query: q }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `The server answered with status ${res.status}.`;
        try {
          const j = JSON.parse((await res.text()).split("\n")[0]);
          msg = j.message || j.error || msg;
        } catch {}
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        buf += dec.decode(value, { stream: !done });
        const lines = buf.split("\n");
        buf = done ? "" : lines.pop()!;
        for (const line of lines) if (line.trim()) handle(JSON.parse(line));
        if (done) break;
      }
      if (!gotResult) setError((e) => e ?? "The run ended before a result arrived.");
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(
        e instanceof TypeError
          ? "Could not reach Baleen. Check your connection, then try again."
          : e instanceof SyntaxError
            ? "Baleen sent back a reply it could not read."
            : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      if (abort.current === ac) setRunning(false);
    }
  }

  const retry = () => last.current && run(last.current.query, last.current.live);

  return (
    <>
      <header className="on-deep overflow-hidden bg-abyss text-foam">
        <Fringe />
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-2 sm:px-8 md:pb-16">
          <h1 className="text-[clamp(4rem,15vw,8.5rem)] font-extrabold leading-[0.85] tracking-[-0.045em]">Baleen</h1>
          <p className="mt-4 max-w-[34ch] text-xl leading-snug md:text-2xl">Filters the shelf down to what actually works.</p>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-foam/80">
            For over-the-counter skin and hair products sold in the US: hair loss, acne, anti-aging, dandruff, sunscreen and dark spots. Not pills, supplements or prescriptions.
          </p>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              run(query);
            }}
            className="mt-8 flex max-w-2xl gap-1 rounded-full bg-shell p-1.5 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-foam"
          >
            <label htmlFor="q" className="sr-only">
              What do you want to compare?
            </label>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. hair loss serum"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent pl-4 text-base text-abyss placeholder:text-drift focus-visible:outline-none"
            />
            <button type="submit" className="shrink-0 rounded-full bg-abyss px-5 py-2.5 font-semibold text-foam hover:bg-drift">
              {running ? "Comparing" : "Compare"}
            </button>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-foam/80">Try</span>
            {CHIPS.map(([label, q]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setQuery(q);
                  run(q);
                }}
                className="rounded-full border border-foam/40 px-3.5 py-1.5 text-sm hover:border-foam hover:bg-foam/10"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 md:py-14">
        {!stages && !result && !error && (
          <p className="max-w-[58ch] text-lg leading-relaxed text-drift">
            Ask about a skin or hair product. Baleen searches US retailers, checks each product against its FDA label, counts the
            published research, and works out the cost per month. Then it makes a pick and shows its work.
          </p>
        )}

        {stages && (running || (error && !result)) && (
          <div className="mb-10">
            <Stages state={stages} />
          </div>
        )}

        {error && !result && (
          <div role="alert" className="mb-10 max-w-xl rounded-lg border-2 border-krill-ink bg-shell p-5">
            <p className="font-semibold">That run did not finish.</p>
            <p className="mt-1 text-drift">{error}</p>
            {last.current && (
              <button
                type="button"
                onClick={retry}
                className="mt-4 rounded-full bg-abyss px-4 py-2 font-semibold text-foam hover:bg-drift"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {result && (
          <div ref={resultsRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            {/* A failed live run falls back to the cached run. Say so, and keep the result on screen. */}
            {error && (
              <p role="status" className="mb-6 max-w-xl rounded-lg border-2 border-krill-ink bg-shell px-4 py-3 font-semibold">
                {error}
              </p>
            )}
            <Results result={result} onRunLive={() => run(result.query, true)} />
          </div>
        )}
      </main>

      <footer className="border-t border-plate">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
          <h2 className="text-lg font-bold">What Baleen can&apos;t tell you</h2>
          <ul className="mt-3 grid max-w-4xl gap-x-10 gap-y-3 text-sm leading-relaxed text-drift sm:grid-cols-2">
            <li>Brand-level trials are rare. Most studies test the active ingredient, not a specific bottle.</li>
            <li>Research depth is not effect size. Many studies can still show a small benefit.</li>
            <li>Prices change. Each price comes from one retailer on the date shown.</li>
            <li>This is not medical advice. Ask a doctor or pharmacist before you start a treatment.</li>
          </ul>
          <p className="mt-8 text-xs text-drift">Built at OwlHacks 2026.</p>
        </div>
      </footer>
    </>
  );
}
