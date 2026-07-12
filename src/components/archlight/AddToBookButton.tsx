import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookmarkPlus, Check, Loader2, Plus } from "lucide-react";
import {
  addExposureItem,
  createExposureProfile,
  listProfilesWithItems,
} from "@/lib/archlight/exposure.functions";

type ExposureKind =
  | "company" | "supplier" | "customer" | "competitor"
  | "sector" | "region" | "commodity" | "keyword";

export function AddToBookButton({
  name,
  kind = "company",
  compact = false,
}: {
  name: string;
  kind?: ExposureKind;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const clean = (name || "").trim();

  const profilesQ = useQuery({
    queryKey: ["exposures", "profiles"],
    queryFn: () => listProfilesWithItems(),
    enabled: open,
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["exposures"] });
    qc.invalidateQueries({ queryKey: ["archlight"] });
  };

  const add = useMutation({
    mutationFn: (vars: { profile_id: string; profile_name: string }) =>
      addExposureItem({
        data: { profile_id: vars.profile_id, kind, name: clean, weight: 5 },
      }).then(() => vars),
    onSuccess: (vars) => {
      toast.success(`Added ${clean} to ${vars.profile_name}`);
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error("Add failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const createAndAdd = useMutation({
    mutationFn: async () => {
      const profile = await createExposureProfile({ data: { name: "My book" } });
      await addExposureItem({ data: { profile_id: profile.id, kind, name: clean, weight: 5 } });
      return profile;
    },
    onSuccess: (p) => {
      toast.success(`Added ${clean} to ${p.name}`);
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error("Add failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (!clean) return null;

  const profiles = profilesQ.data?.profiles ?? [];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 hover:border-[color:var(--color-signal)]/60 hover:text-[color:var(--color-signal)] ${compact ? "text-[10px] font-mono px-1.5 py-0.5" : "text-[11px] px-2 py-1"}`}
        title="Add to my book"
      >
        <BookmarkPlus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}/>
        {compact ? "book" : "Add to my book"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border/60 bg-background/95 backdrop-blur p-2 shadow-lg">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
            Add “{clean}” as {kind}
          </div>
          {profilesQ.isLoading && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
              <Loader2 className="h-3 w-3 animate-spin"/>loading…
            </div>
          )}
          {profilesQ.data && profiles.length > 0 && (
            <ul className="max-h-40 overflow-auto space-y-1">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={add.isPending}
                    onClick={() => add.mutate({ profile_id: p.id, profile_name: p.name })}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent/40 flex items-center gap-1.5"
                  >
                    <Check className="h-3 w-3 opacity-60"/>{p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {profilesQ.data && profiles.length === 0 && (
            <button
              type="button"
              disabled={createAndAdd.isPending}
              onClick={() => createAndAdd.mutate()}
              className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded border border-[color:var(--color-signal)]/60 text-[11px] text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
            >
              <Plus className="h-3 w-3"/>
              {createAndAdd.isPending ? "Creating…" : "Create ‘My book’ and add"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
