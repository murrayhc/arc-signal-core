import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Send, Plus, Trash2, Radio, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/archlight/AppShell";
import {
  addDeliveryChannel,
  listDeliveryChannels,
  removeDeliveryChannel,
  sendTestMessage,
} from "@/lib/archlight/delivery.functions";
import { listProfilesWithItems } from "@/lib/archlight/exposure.functions";

export const Route = createFileRoute("/settings/delivery")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Delivery channels" },
      { name: "description", content: "Push exposure hits to Slack or a generic webhook — real-time delivery for what matters to you." },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["delivery", "channels"],
    queryFn: () => listDeliveryChannels(),
  });
  const { data: profiles } = useQuery({
    queryKey: ["exposures", "profiles"],
    queryFn: () => listProfilesWithItems(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["delivery"] });

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-5">
        <header>
          <Link to="/exposures" className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3"/> Back to exposures
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mt-2">
            <Radio className="h-3.5 w-3.5"/> Real-time delivery
          </div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal">Delivery channels</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Push exposure hits to Slack or a generic webhook the moment they're scored. Each channel has a minimum relevance threshold and can optionally scope to a single profile.
          </p>
        </header>

        <AddChannelForm profiles={profiles?.profiles ?? []} onAdded={invalidate}/>

        {isLoading && <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>}
        {data && data.channels.length === 0 && (
          <div className="glass-panel rounded-xl p-8 text-center">
            <div className="font-display text-lg">No channels yet</div>
            <p className="text-sm text-muted-foreground mt-2">Add a Slack incoming-webhook URL or a generic webhook endpoint above. Hits will be pushed automatically after each scan.</p>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {(data?.channels ?? []).map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              profileName={(data?.profiles ?? []).find((p) => p.id === c.profile_id)?.name ?? null}
              onChanged={invalidate}
            />
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

type PublicChannel = Awaited<ReturnType<typeof listDeliveryChannels>>["channels"][number];
type ProfileLite = { id: string; name: string };

function AddChannelForm({ profiles, onAdded }: { profiles: ProfileLite[]; onAdded: () => void }) {
  const [kind, setKind] = useState<"slack" | "webhook">("slack");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [profileId, setProfileId] = useState<string>("");
  const [minRelevance, setMinRelevance] = useState(0.6);

  const add = useMutation({
    mutationFn: () => addDeliveryChannel({
      data: {
        kind,
        url: url.trim(),
        label: label.trim() || null,
        profileId: profileId || null,
        minRelevance,
      },
    }),
    onSuccess: () => {
      toast.success("Channel added");
      setUrl(""); setLabel(""); setProfileId(""); setMinRelevance(0.6);
      onAdded();
    },
    onError: (e) => toast.error("Add failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <section className="glass-panel rounded-xl p-4">
      <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) add.mutate(); }} className="grid grid-cols-12 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as "slack" | "webhook")} className="col-span-6 md:col-span-2 h-9 px-2 rounded-md border border-border/60 bg-background/50 text-sm">
          <option value="slack">slack</option>
          <option value="webhook">webhook</option>
        </select>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={kind === "slack" ? "https://hooks.slack.com/services/…" : "https://your-endpoint.example.com/hook"}
          className="col-span-12 md:col-span-5 h-9 px-3 rounded-md border border-border/60 bg-background/50 text-sm outline-none focus:border-[color:var(--color-signal)]/60"
          type="url"
          required
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label (optional)"
          className="col-span-6 md:col-span-2 h-9 px-3 rounded-md border border-border/60 bg-background/50 text-sm"
        />
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="col-span-6 md:col-span-2 h-9 px-2 rounded-md border border-border/60 bg-background/50 text-sm"
          title="Scope to a profile (or all active)"
        >
          <option value="">All active profiles</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          type="submit"
          disabled={add.isPending || !url.trim()}
          className="col-span-12 md:col-span-1 inline-flex items-center justify-center gap-1 h-9 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5"/> Add
        </button>

        <div className="col-span-12 flex items-center gap-3 mt-1">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">Min relevance</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={minRelevance}
            onChange={(e) => setMinRelevance(Number(e.target.value))}
            className="flex-1 accent-[color:var(--color-signal)]"
          />
          <span className="text-xs font-mono tabular-nums w-10 text-right">{Math.round(minRelevance * 100)}%</span>
        </div>
      </form>
    </section>
  );
}

function ChannelRow({ channel, profileName, onChanged }: {
  channel: PublicChannel;
  profileName: string | null;
  onChanged: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => removeDeliveryChannel({ data: { id: channel.id } }),
    onSuccess: () => { toast.success("Channel removed"); onChanged(); },
    onError: (e) => toast.error("Remove failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  const test = useMutation({
    mutationFn: () => sendTestMessage({ data: { id: channel.id } }),
    onSuccess: (r: { ok: boolean; status: number; error?: string }) => {
      if (r.ok) toast.success(`Test sent (HTTP ${r.status})`);
      else toast.error(`Test failed (HTTP ${r.status || "network"})`);
    },
    onError: (e) => toast.error("Test failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <li className="glass-panel rounded-xl p-4 flex items-start gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">
          {channel.kind}
        </span>
        <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${channel.active ? "border-[color:var(--color-growth)]/60 text-[color:var(--color-growth)]" : "border-border/60 text-muted-foreground"}`}>
          {channel.active ? "active" : "paused"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm truncate">{channel.label ?? channel.url_host ?? "channel"}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span>host {channel.url_host || "—"}</span>
          <span>min {Math.round(channel.min_relevance * 100)}%</span>
          <span>{profileName ? `profile: ${profileName}` : "all active profiles"}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={() => test.mutate()}
          disabled={test.isPending}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-50"
        >
          <Send className="h-3 w-3"/> {test.isPending ? "Sending…" : "Send test"}
        </button>
        <button
          onClick={() => { if (confirm("Remove this delivery channel?")) remove.mutate(); }}
          className="h-8 w-8 grid place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-[color:var(--color-risk)] hover:border-[color:var(--color-risk)]/50"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5"/>
        </button>
      </div>
    </li>
  );
}
