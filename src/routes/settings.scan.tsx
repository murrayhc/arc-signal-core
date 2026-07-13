import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/archlight/AppShell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getScanSettings, updateScanSettings, resetScanSettings } from "@/lib/archlight/settings.functions";
import { DEFAULT_SCAN_SETTINGS, countKnobsOffDefault, type ScanSettings } from "@/lib/archlight/settings.defaults";

export const Route = createFileRoute("/settings/scan")({
  head: () => ({
    meta: [
      { title: "Scan Settings · Arklight" },
      { name: "description", content: "Tune Arklight scan behaviour — source count, clustering, quality floors and cache duration." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScanSettingsPage,
});

const CACHE_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "1 month", ms: 30 * 24 * 60 * 60 * 1000 },
];

function ScanSettingsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["scan-settings"], queryFn: () => getScanSettings() });
  const [draft, setDraft] = useState<ScanSettings | null>(null);

  useEffect(() => { if (data) setDraft(data); }, [data]);

  const save = useMutation({
    mutationFn: (s: ScanSettings) => updateScanSettings({ data: s }),
    onSuccess: () => {
      toast.success("Scan settings saved", { description: "Applies to the next scan run." });
      qc.invalidateQueries({ queryKey: ["scan-settings"] });
      router.invalidate();
    },
    onError: (e) => toast.error("Save failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const reset = useMutation({
    mutationFn: () => resetScanSettings(),
    onSuccess: (r) => {
      setDraft(r.settings);
      toast.success("Restored default scan settings");
      qc.invalidateQueries({ queryKey: ["scan-settings"] });
      router.invalidate();
    },
    onError: (e) => toast.error("Reset failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const dirty = draft && data && JSON.stringify(draft) !== JSON.stringify(data);
  const offDefault = draft ? countKnobsOffDefault(draft) : 0;

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Configuration</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal">Scan Settings</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Fine-tune how the pipeline pulls signals, clusters them, and decides which events are worth surfacing. Applies to the next scan; in-flight scans are unaffected.
          </p>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-border/60 text-muted-foreground">
          {offDefault === 0 ? "Baseline" : `${offDefault} knob${offDefault === 1 ? "" : "s"} off default`}
        </div>
      </div>

      {isLoading || !draft ? (
        <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section title="Signal intake" subtitle="How much raw material each scan is allowed to pull.">
            <SliderRow
              label="Sources per scan"
              hint={`Top N active sources by reliability. Default ${DEFAULT_SCAN_SETTINGS.sources_per_scan}.`}
              value={draft.sources_per_scan} min={1} max={60} step={1}
              onChange={(v) => setDraft({ ...draft, sources_per_scan: v })}
              suffix={String(draft.sources_per_scan)}
            />
            <SliderRow
              label="Items pulled per RSS feed"
              hint={`Higher = more docs per scan. Default ${DEFAULT_SCAN_SETTINGS.items_per_feed}.`}
              value={draft.items_per_feed} min={1} max={8} step={1}
              onChange={(v) => setDraft({ ...draft, items_per_feed: v })}
              suffix={String(draft.items_per_feed)}
            />
            <SliderRow
              label="Copy-loop Jaccard threshold"
              hint={`Docs with shingle-Jaccard ≥ this vs recent docs get flagged as copies. Lower = more aggressive de-dup. Default ${DEFAULT_SCAN_SETTINGS.copy_loop_jaccard}.`}
              value={draft.copy_loop_jaccard} min={0.3} max={0.9} step={0.01}
              onChange={(v) => setDraft({ ...draft, copy_loop_jaccard: Number(v.toFixed(2)) })}
              suffix={draft.copy_loop_jaccard.toFixed(2)}
            />
          </Section>

          <Section title="Clustering / event creation" subtitle="How atomic claims collapse into event candidates.">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Bucketing strategy</Label>
                <span className="text-[10px] font-mono text-muted-foreground">default type + sector</span>
              </div>
              <RadioGroup
                value={draft.bucketing_strategy}
                onValueChange={(v) => setDraft({ ...draft, bucketing_strategy: v as ScanSettings["bucketing_strategy"] })}
                className="grid grid-cols-3 gap-2"
              >
                {[
                  { v: "type_sector", label: "Type + Sector", note: "narrowest" },
                  { v: "type", label: "Type only", note: "wider" },
                  { v: "sector", label: "Sector only", note: "wider" },
                ].map((o) => (
                  <label key={o.v} className={`flex flex-col gap-1 rounded-md border p-2.5 text-xs cursor-pointer transition ${draft.bucketing_strategy === o.v ? "border-[color:var(--color-signal)] bg-[color:var(--color-signal)]/5" : "border-border/60 hover:bg-accent/30"}`}>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={o.v} id={`bs-${o.v}`} />
                      <span className="font-medium">{o.label}</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{o.note}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <SliderRow
              label="Cluster merge cosine"
              hint={`Buckets with centroid cosine ≥ this get merged into one event. Higher = fewer merges, more distinct events. Default ${DEFAULT_SCAN_SETTINGS.cluster_merge_cosine}.`}
              value={draft.cluster_merge_cosine} min={0.5} max={0.95} step={0.01}
              onChange={(v) => setDraft({ ...draft, cluster_merge_cosine: Number(v.toFixed(2)) })}
              suffix={draft.cluster_merge_cosine.toFixed(2)}
            />
            <SliderRow
              label="Max claims per cluster (0 = off)"
              hint={`If set, oversized clusters split by region/entity so one big story becomes multiple events. Default ${DEFAULT_SCAN_SETTINGS.max_claims_per_cluster}.`}
              value={draft.max_claims_per_cluster} min={0} max={20} step={1}
              onChange={(v) => setDraft({ ...draft, max_claims_per_cluster: v })}
              suffix={draft.max_claims_per_cluster === 0 ? "off" : String(draft.max_claims_per_cluster)}
            />
          </Section>

          <Section title="Event quality floor" subtitle="Skip events that don't meet these minimums. Skipped events are logged to the scan run.">
            <SliderRow
              label="Minimum evidence count"
              hint={`Reject events with fewer atomic claims. Default ${DEFAULT_SCAN_SETTINGS.min_evidence_count}.`}
              value={draft.min_evidence_count} min={1} max={10} step={1}
              onChange={(v) => setDraft({ ...draft, min_evidence_count: v })}
              suffix={String(draft.min_evidence_count)}
            />
            <SliderRow
              label="Minimum source diversity"
              hint={`Reject events where ${"<"} N distinct sources contribute (1.0 = 3+ sources). Default ${DEFAULT_SCAN_SETTINGS.min_source_diversity}.`}
              value={draft.min_source_diversity} min={0} max={1} step={0.05}
              onChange={(v) => setDraft({ ...draft, min_source_diversity: Number(v.toFixed(2)) })}
              suffix={draft.min_source_diversity.toFixed(2)}
            />
            <SliderRow
              label="Minimum confidence"
              hint={`Reject events with synthesised confidence below this. Default ${DEFAULT_SCAN_SETTINGS.min_confidence}.`}
              value={draft.min_confidence} min={0} max={1} step={0.05}
              onChange={(v) => setDraft({ ...draft, min_confidence: Number(v.toFixed(2)) })}
              suffix={draft.min_confidence.toFixed(2)}
            />
          </Section>

          <Section title="Interrogation cache" subtitle="How long an interrogation result is served from cache before a fresh LLM call.">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CACHE_OPTIONS.map((o) => (
                <button
                  key={o.ms}
                  onClick={() => setDraft({ ...draft, interrogation_cache_ms: o.ms })}
                  className={`text-xs rounded-md border px-3 py-2 transition ${draft.interrogation_cache_ms === o.ms ? "border-[color:var(--color-signal)] bg-[color:var(--color-signal)]/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/30 hover:text-foreground"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Default: 1 week. Users can always force a fresh call from the interrogation page itself.
            </p>
          </Section>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 mt-4 border-t border-border/60 bg-background/85 backdrop-blur-xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-muted-foreground">
          Applies to the next scan. In-flight scans are unaffected. <Link to="/" className="underline hover:text-foreground">Back to dashboard</Link>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={reset.isPending} onClick={() => reset.mutate()}>
            {reset.isPending ? "Restoring…" : "Return to Default"}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending || !draft}
            onClick={() => draft && save.mutate(draft)}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-xl p-4 space-y-4">
      <div>
        <h3 className="font-display text-sm tracking-wide">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SliderRow({ label, hint, value, min, max, step, onChange, suffix }: {
  label: string; hint: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</Label>
        <span className="text-xs font-mono tabular-nums text-foreground">{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
      <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>
    </div>
  );
}
