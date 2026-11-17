import type { StageId } from "@/lib/types";

export type StageState = Partial<Record<StageId, { status: "start" | "done" | "error"; detail?: string }>>;

const STAGES: [StageId, string][] = [
  ["discover", "Searching the shelf"],
  ["fda", "Checking FDA records"],
  ["evidence", "Reading the research"],
  ["cost", "Doing the math"],
  ["verdict", "Writing the verdict"],
];

export function Stages({ state }: { state: StageState }) {
  return (
    <ol aria-label="Progress" aria-live="polite" className="max-w-xl space-y-3">
      {STAGES.map(([id, label]) => {
        const s = state[id];
        const status = s?.status ?? "waiting";
        return (
          <li key={id} className={`flex gap-3 ${status === "waiting" ? "text-drift" : ""}`}>
            <Marker status={status} />
            <div>
              <p className="font-semibold">
                {label}
                <span className="sr-only">: {status === "start" ? "in progress" : status}</span>
              </p>
              {s?.detail && <p className="text-sm text-drift">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Marker({ status }: { status: string }) {
  const base = "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold";
  if (status === "done") return <span aria-hidden className={`${base} bg-abyss text-foam`}>✓</span>;
  if (status === "error") return <span aria-hidden className={`${base} bg-krill-ink text-white`}>!</span>;
  if (status === "start") return <span aria-hidden className={`${base} pulse border-2 border-abyss`} />;
  return <span aria-hidden className={`${base} border-2 border-plate`} />;
}
