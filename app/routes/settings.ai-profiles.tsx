import { useState } from "react";
import { Form, Link, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/settings.ai-profiles";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

export function meta() {
  return [{ title: "AI Profiles — ProjectSpice" }];
}

// Seeded templates shown in the "new profile" wizard
export const PROFILE_TEMPLATES = [
  {
    id: "henry",
    label: "Henry (Balanced)",
    systemPrompt:
      "You are a culinary assistant helping improve recipes. Prioritize balanced nutrition, bold flavors, and approachable techniques. Preserve the spirit of the original dish while suggesting practical improvements.",
    preferences: { style: "balanced", difficulty: "intermediate" },
  },
  {
    id: "mom",
    label: "Mom (Healthy)",
    systemPrompt:
      "You are a culinary assistant focused on healthy cooking. Reduce saturated fats, sodium, and refined sugars without sacrificing flavor. Suggest whole-food substitutions and lighter cooking methods.",
    preferences: { style: "healthy", difficulty: "beginner" },
  },
  {
    id: "dad",
    label: "Dad (Easy)",
    systemPrompt:
      "You are a culinary assistant focused on simplicity. Minimize steps and ingredient counts. Prefer one-pot or sheet-pan methods. Suggest shortcuts that don't compromise the final result.",
    preferences: { style: "easy", difficulty: "beginner" },
  },
] as const;

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const profiles = await db
    .select()
    .from(schema.aiProfiles)
    .where(eq(schema.aiProfiles.userId, user.id))
    .orderBy(schema.aiProfiles.name);

  return { user, profiles };
}

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "create") {
    const name = String(fd.get("name") ?? "").trim();
    const systemPrompt = String(fd.get("systemPrompt") ?? "").trim();
    const preferencesRaw = String(fd.get("preferences") ?? "").trim();
    const familyMemberAge = String(fd.get("familyMemberAge") ?? "").trim();

    if (!name) return { error: "Profile name is required." };
    if (!systemPrompt) return { error: "System prompt is required." };

    // Duplicate name guard
    const [collision] = await db
      .select({ id: schema.aiProfiles.id })
      .from(schema.aiProfiles)
      .where(
        and(eq(schema.aiProfiles.userId, user.id), eq(schema.aiProfiles.name, name))
      );
    if (collision) return { error: `A profile named "${name}" already exists.` };

    let preferences: Record<string, unknown> = {};
    if (preferencesRaw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(preferencesRaw);
      } catch {
        return { error: "Preferences must be valid JSON." };
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { error: "Preferences must be a JSON object, not an array or primitive." };
      }
      preferences = parsed as Record<string, unknown>;
    }
    if (familyMemberAge) {
      const age = Number(familyMemberAge);
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        return { error: "Family member age must be a number between 1 and 120." };
      }
      preferences = { ...preferences, familyMemberAge: age };
    }

    await db.insert(schema.aiProfiles).values({
      userId: user.id,
      name,
      systemPrompt,
      preferences: Object.keys(preferences).length > 0 ? preferences : null,
    });

    return redirect("/settings/ai-profiles");
  }

  if (intent === "update") {
    const profileId = String(fd.get("profileId") ?? "");
    const name = String(fd.get("name") ?? "").trim();
    const systemPrompt = String(fd.get("systemPrompt") ?? "").trim();
    const preferencesRaw = String(fd.get("preferences") ?? "").trim();
    const familyMemberAge = String(fd.get("familyMemberAge") ?? "").trim();

    if (!name) return { error: "Profile name is required." };
    if (!systemPrompt) return { error: "System prompt is required." };

    const [existing] = await db
      .select({ id: schema.aiProfiles.id })
      .from(schema.aiProfiles)
      .where(
        and(
          eq(schema.aiProfiles.id, profileId),
          eq(schema.aiProfiles.userId, user.id)
        )
      );
    if (!existing) return { error: "Profile not found." };

    let preferences: Record<string, unknown> = {};
    if (preferencesRaw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(preferencesRaw);
      } catch {
        return { error: "Preferences must be valid JSON." };
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { error: "Preferences must be a JSON object, not an array or primitive." };
      }
      preferences = parsed as Record<string, unknown>;
    }
    if (familyMemberAge) {
      const age = Number(familyMemberAge);
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        return { error: "Family member age must be a number between 1 and 120." };
      }
      preferences = { ...preferences, familyMemberAge: age };
    }

    await db
      .update(schema.aiProfiles)
      .set({
        name,
        systemPrompt,
        preferences: Object.keys(preferences).length > 0 ? preferences : null,
      })
      .where(eq(schema.aiProfiles.id, profileId));

    return redirect("/settings/ai-profiles");
  }

  if (intent === "delete") {
    const profileId = String(fd.get("profileId") ?? "");
    const [existing] = await db
      .select({ id: schema.aiProfiles.id })
      .from(schema.aiProfiles)
      .where(
        and(
          eq(schema.aiProfiles.id, profileId),
          eq(schema.aiProfiles.userId, user.id)
        )
      );
    if (!existing) return { error: "Profile not found." };
    await db.delete(schema.aiProfiles).where(eq(schema.aiProfiles.id, profileId));
    return redirect("/settings/ai-profiles");
  }

  return { error: "Unknown action." };
}

// ─── Component helpers ──────────────────────────────────────────────────────────

type AiProfile = {
  id: string;
  name: string;
  systemPrompt: string;
  preferences: unknown;
};

function extractAge(preferences: unknown): string {
  if (preferences && typeof preferences === "object") {
    const p = preferences as Record<string, unknown>;
    if (typeof p.familyMemberAge === "number") return String(p.familyMemberAge);
  }
  return "";
}

function prefsWithoutAge(preferences: unknown): string {
  if (!preferences || typeof preferences !== "object") return "";
  const p = { ...(preferences as Record<string, unknown>) };
  delete p.familyMemberAge;
  return Object.keys(p).length > 0 ? JSON.stringify(p, null, 2) : "";
}

function ProfileForm({
  profile,
  onCancel,
}: {
  profile?: AiProfile;
  onCancel: () => void;
}) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const isEdit = !!profile;

  const [name, setName] = useState(profile?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(profile?.systemPrompt ?? "");
  const [preferences, setPreferences] = useState(
    prefsWithoutAge(profile?.preferences)
  );
  const [familyMemberAge, setFamilyMemberAge] = useState(
    extractAge(profile?.preferences)
  );
  const [selectedTemplate, setSelectedTemplate] = useState("");

  function applyTemplate(templateId: string) {
    const t = PROFILE_TEMPLATES.find((t) => t.id === templateId);
    if (!t) return;
    setSelectedTemplate(templateId);
    if (!isEdit) setName(t.label);
    setSystemPrompt(t.systemPrompt);
    setPreferences(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(t.preferences).filter(([k]) => k !== "familyMemberAge")
        ),
        null,
        2
      )
    );
  }

  return (
    <Form method="post" className="ps-surface space-y-4 p-4">
      <input type="hidden" name="_intent" value={isEdit ? "update" : "create"} />
      {isEdit && <input type="hidden" name="profileId" value={profile.id} />}

      {/* Template picker only shown when creating */}
      {!isEdit && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase text-ink-3">
            Start from a template
          </label>
          <div className="flex flex-wrap gap-2">
            {PROFILE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ps-focus-ring ${
                  selectedTemplate === t.id
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-rule bg-paper-2 text-ink-3 hover:bg-paper-3 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-3">
          Profile name <span className="text-err">*</span>
        </label>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Henry (Balanced)"
          className="ps-control w-full border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-3">
          System prompt <span className="text-err">*</span>
        </label>
        <textarea
          name="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Describe how the AI should approach improving recipes for this profile…"
          rows={5}
          className="ps-control w-full resize-y border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring ps-mono"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-3">
          Family member age{" "}
          <span className="text-ink-4">(optional - informs food-safety rules)</span>
        </label>
        <input
          name="familyMemberAge"
          type="number"
          min={1}
          max={120}
          value={familyMemberAge}
          onChange={(e) => setFamilyMemberAge(e.target.value)}
          placeholder="e.g. 8"
          className="ps-control w-32 border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-3">
          Preferences JSON{" "}
          <span className="text-ink-4">(optional extra metadata)</span>
        </label>
        <textarea
          name="preferences"
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder={'{"style": "healthy", "difficulty": "beginner"}'}
          rows={3}
          className="ps-control w-full resize-y border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring ps-mono"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !name.trim() || !systemPrompt.trim()}
        >
          {isEdit ? "Save changes" : "Create profile"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

function ProfileCard({ profile }: { profile: AiProfile }) {
  const [editing, setEditing] = useState(false);
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  if (editing) {
    return <ProfileForm profile={profile} onCancel={() => setEditing(false)} />;
  }

  const age = extractAge(profile.preferences);

  return (
    <div className="ps-surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{profile.name}</p>
          {age && (
            <p className="mt-0.5 text-xs text-ink-3">Family member age: {age}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-ink-3 hover:text-ink"
          >
            Edit
          </button>
          <Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(`Delete profile "${profile.name}"?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="_intent" value="delete" />
            <input type="hidden" name="profileId" value={profile.id} />
            <button
              type="submit"
              disabled={busy}
              className="text-sm font-medium text-err disabled:opacity-50"
            >
              Delete
            </button>
          </Form>
        </div>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap rounded-md bg-paper-3 p-3 text-xs text-ink-3 ps-mono">
        {profile.systemPrompt}
      </p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type ActionData = { error: string } | undefined;

export default function SettingsAiProfiles({ loaderData }: Route.ComponentProps) {
  const { user, profiles } = loaderData;
  const actionData = useActionData<ActionData>();
  const [creating, setCreating] = useState(false);

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-5">
        <SectionHeader
          eyebrow="AI behavior"
          title="AI Profiles"
          description="Profiles control how recipe improvements interpret family needs, skill level, and cooking goals."
          actions={
            <Chip>
              {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
            </Chip>
          }
        />

        {actionData?.error && (
          <div className="rounded-md border border-err/30 bg-err/10 p-3 text-sm text-err">
            {actionData.error}
          </div>
        )}

        <Link to="/settings" className="inline-flex text-sm font-medium text-ink-3 hover:text-ink">
          Back to settings
        </Link>

        {profiles.length === 0 && !creating && (
          <div className="ps-surface py-12 text-center text-sm text-ink-3">
            No profiles yet. Create one to get started.
          </div>
        )}

        {profiles.map((p) => (
          <ProfileCard key={p.id} profile={p} />
        ))}

        {creating ? (
          <ProfileForm onCancel={() => setCreating(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ps-control w-full border border-dashed border-rule bg-paper-2 py-3 text-sm font-medium text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink focus-visible:ps-focus-ring"
          >
            + New profile
          </button>
        )}
      </div>
    </AppShell>
  );
}
