import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Crosshair, Plus, Trash2, Check, X, Pencil, Radio } from "lucide-react";
import { AppShell } from "@/components/archlight/AppShell";
import {
  addExposureItem,
  createExposureProfile,
  deleteExposureProfile,
  listProfilesWithItems,
  removeExposureItem,
  updateExposureProfile,
} from "@/lib/archlight/exposure.functions";

export const Route = createFileRoute("/exposures")({
  head: () => ({
    meta: [
      { title: "Archlight · Exposures" },
      { name: "description", content: "Tell Archlight what you hold — companies, sectors, regions, commodities, keywords — and every synthesised event is scored against your exposure." },
    ],
  }),
  component: ExposuresPage,
});

const KIND_OPTIONS = [
  "company", "supplier", "customer", "competitor",
  "sector", "region", "commodity", "keyword",
] as const;
type Kind = (typeof KIND_OPTIONS)[number];

function ExposuresPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["exposures", "profiles"],
    queryFn: () => listProfilesWithItems(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["exposures"] });

  const createProfile = useMutation({
    mutationFn: (name: string) => createExposureProfile({ data: { name } }),
    onSuccess: () => { toast.success("Profile created"); invalidate(); },
    onError: (e) => toast.error("Create failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const [newProfileName, setNewProfileName] = useState("");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-5">
        <header>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
            <Crosshair className="h-3.5 w-3.5"/> Exposure profiles
          </div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal">Your exposures</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Tell Archlight what you hold or care about. Every synthesised event is scored against these items, and the "why this matters to you" rail is built from those matches.
          </p>
        </header>

        <section className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = newProfileName.trim();
                if (!n) return;
                createProfile.mutate(n);
                setNewProfileName("");
              }}
              className="flex items-center gap-2 flex-1"
            >
              <input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="New profile name (e.g. 'Personal portfolio', 'Manufacturing clients')"
                className="flex-1 h-9 px-3 rounded-md border border-border/60 bg-background/50 text-sm outline-none focus:border-[color:var(--color-signal)]/60"
              />
              <button
                type="submit"
                disabled={createProfile.isPending || !newProfileName.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5"/> Add profile
              </button>
            </form>
          </div>
        </section>

        {isLoading && <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>}
        {data && data.profiles.length === 0 && (
          <div className="glass-panel rounded-xl p-8 text-center">
            <div className="font-display text-lg">No profiles yet</div>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first profile above. Add companies you hold, sectors you sell into, regions you operate in, or keywords you watch — Archlight will score every event against them.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {(data?.profiles ?? []).map((p) => (
            <ProfileCard key={p.id} profile={p as ProfileWithItems} onChanged={invalidate}/>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

type ProfileWithItems = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  items: Array<{
    id: string;
    name: string;
    kind: Kind;
    weight: number;
    value_gbp: number | null;
    notes: string | null;
    hit_count: number;
  }>;
};

function ProfileCard({ profile, onChanged }: { profile: ProfileWithItems; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);

  const toggle = useMutation({
    mutationFn: () => updateExposureProfile({ data: { id: profile.id, active: !profile.active } }),
    onSuccess: () => { onChanged(); toast.success(profile.active ? "Profile paused" : "Profile active"); },
    onError: (e) => toast.error("Toggle failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const rename = useMutation({
    mutationFn: () => updateExposureProfile({ data: { id: profile.id, name: name.trim() } }),
    onSuccess: () => { setEditing(false); onChanged(); toast.success("Renamed"); },
    onError: (e) => toast.error("Rename failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: () => deleteExposureProfile({ data: { id: profile.id } }),
    onSuccess: () => { onChanged(); toast.success("Profile removed"); },
    onError: (e) => toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 px-2 rounded-md border border-border/60 bg-background/50 text-sm outline-none"
              autoFocus
            />
            <button onClick={() => rename.mutate()} className="h-8 w-8 grid place-items-center rounded-md border border-border/60 hover:bg-accent/40" title="Save">
              <Check className="h-3.5 w-3.5"/>
            </button>
            <button onClick={() => { setEditing(false); setName(profile.name); }} className="h-8 w-8 grid place-items-center rounded-md border border-border/60 hover:bg-accent/40" title="Cancel">
              <X className="h-3.5 w-3.5"/>
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-lg">{profile.name}</h2>
            <button onClick={() => setEditing(true)} className="h-7 w-7 grid place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground" title="Rename">
              <Pencil className="h-3 w-3"/>
            </button>
          </>
        )}
        <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${profile.active ? "border-[color:var(--color-growth)]/60 text-[color:var(--color-growth)]" : "border-border/60 text-muted-foreground"}`}>
          {profile.active ? "active" : "paused"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => toggle.mutate()}
            className="h-7 px-2.5 rounded-md text-[10px] border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40"
          >
            {profile.active ? "Pause" : "Activate"}
          </button>
          <button
            onClick={() => { if (confirm(`Delete profile "${profile.name}" and all its items?`)) del.mutate(); }}
            className="h-7 px-2.5 rounded-md text-[10px] border border-[color:var(--color-risk)]/50 text-[color:var(--color-risk)] hover:bg-[color:var(--color-risk)]/10"
          >
            Delete
          </button>
        </div>
      </div>

      <AddItemForm profileId={profile.id} onAdded={onChanged}/>

      {profile.items.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">No items yet — add companies, sectors, regions, commodities or keywords above.</div>
      ) : (
        <ul className="mt-3 grid md:grid-cols-2 gap-2">
          {profile.items.map((it) => (
            <ItemRow key={it.id} item={it} onRemoved={onChanged}/>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddItemForm({ profileId, onAdded }: { profileId: string; onAdded: () => void }) {
  const [kind, setKind] = useState<Kind>("company");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("1");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");

  const add = useMutation({
    mutationFn: () => addExposureItem({
      data: {
        profile_id: profileId,
        kind,
        name: name.trim(),
        weight: Number(weight) || 1,
        value_gbp: value.trim() ? Number(value) : null,
        notes: notes.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Item added — scoring against recent events…");
      setName(""); setValue(""); setNotes(""); setWeight("1");
      onAdded();
    },
    onError: (e) => toast.error("Add failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}
      className="mt-3 grid grid-cols-12 gap-2"
    >
      <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="col-span-6 md:col-span-2 h-9 px-2 rounded-md border border-border/60 bg-background/50 text-sm">
        {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. BAE Systems, Aerospace, Copper)" className="col-span-12 md:col-span-4 h-9 px-3 rounded-md border border-border/60 bg-background/50 text-sm outline-none focus:border-[color:var(--color-signal)]/60"/>
      <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.1" min="0" max="10" placeholder="weight" className="col-span-4 md:col-span-1 h-9 px-2 rounded-md border border-border/60 bg-background/50 text-sm"/>
      <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="1" min="0" placeholder="£ value" className="col-span-4 md:col-span-2 h-9 px-2 rounded-md border border-border/60 bg-background/50 text-sm"/>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes" className="col-span-12 md:col-span-2 h-9 px-2 rounded-md border border-border/60 bg-background/50 text-sm"/>
      <button
        type="submit"
        disabled={add.isPending || !name.trim()}
        className="col-span-4 md:col-span-1 inline-flex items-center justify-center gap-1 h-9 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5"/> Add
      </button>
    </form>
  );
}

function ItemRow({ item, onRemoved }: { item: ProfileWithItems["items"][number]; onRemoved: () => void }) {
  const remove = useMutation({
    mutationFn: () => removeExposureItem({ data: { id: item.id } }),
    onSuccess: () => { toast.success("Item removed"); onRemoved(); },
    onError: (e) => toast.error("Remove failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <li className="rounded-lg border border-border/50 bg-background/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">{item.kind}</span>
            <span className="font-display text-sm truncate">{item.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>weight {Number(item.weight).toFixed(2)}</span>
            {item.value_gbp != null && <span>£{Number(item.value_gbp).toLocaleString("en-GB")}</span>}
            <span className={item.hit_count > 0 ? "text-[color:var(--color-signal)]" : ""}>{item.hit_count} hit{item.hit_count === 1 ? "" : "s"}</span>
          </div>
          {item.notes && <p className="text-[11px] text-muted-foreground mt-1">{item.notes}</p>}
        </div>
        <button
          onClick={() => remove.mutate()}
          className="h-7 w-7 grid place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-[color:var(--color-risk)] hover:border-[color:var(--color-risk)]/50 shrink-0"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5"/>
        </button>
      </div>
    </li>
  );
}
