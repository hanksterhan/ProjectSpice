import { useState } from "react";
import { Form, Link, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/settings.ai-profiles";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

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

  return { profiles };
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
    <Form method="post" className="bg-white border rounded-lg p-4 space-y-4">
      <input type="hidden" name="_intent" value={isEdit ? "update" : "create"} />
      {isEdit && <input type="hidden" name="profileId" value={profile.id} />}

      {/* Template picker — only shown when creating */}
      {!isEdit && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">Start from a template (optional)</label>
          <div className="flex flex-wrap gap-2">
            {PROFILE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedTemplate === t.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Profile name <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Henry (Balanced)"
          className="w-full border rounded px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          System prompt <span className="text-red-500">*</span>
        </label>
        <textarea
          name="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Describe how the AI should approach improving recipes for this profile…"
          rows={5}
          className="w-full border rounded px-3 py-2 text-sm font-mono resize-y"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Family member age{" "}
          <span className="text-gray-400">(optional — informs food-safety rules)</span>
        </label>
        <input
          name="familyMemberAge"
          type="number"
          min={1}
          max={120}
          value={familyMemberAge}
          onChange={(e) => setFamilyMemberAge(e.target.value)}
          placeholder="e.g. 8"
          className="w-32 border rounded px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Preferences JSON{" "}
          <span className="text-gray-400">(optional extra metadata)</span>
        </label>
        <textarea
          name="preferences"
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder={'{"style": "healthy", "difficulty": "beginner"}'}
          rows={3}
          className="w-full border rounded px-3 py-2 text-sm font-mono resize-y"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={busy || !name.trim() || !systemPrompt.trim()}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {isEdit ? "Save changes" : "Create profile"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
        >
          Cancel
        </button>
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
    <div className="bg-white border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900 text-sm">{profile.name}</p>
          {age && (
            <p className="text-xs text-gray-500 mt-0.5">Family member age: {age}</p>
          )}
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 hover:underline"
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
              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </Form>
        </div>
      </div>
      <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3 font-mono bg-gray-50 rounded p-2">
        {profile.systemPrompt}
      </p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type ActionData = { error: string } | undefined;

export default function SettingsAiProfiles({ loaderData }: Route.ComponentProps) {
  const { profiles } = loaderData;
  const actionData = useActionData<ActionData>();
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/settings" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Settings
        </Link>
        <h1 className="font-semibold text-gray-900">AI Profiles</h1>
        <span className="ml-auto text-sm text-gray-500">
          {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {actionData?.error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        <p className="text-sm text-gray-600">
          Profiles control how the AI improves recipes. Each profile has a name, a system
          prompt, and optional preferences. You can create one per family member or cooking
          goal.
        </p>

        {profiles.length === 0 && !creating && (
          <div className="text-center py-12 text-gray-400 text-sm">
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
            className="w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            + New profile
          </button>
        )}
      </main>
    </div>
  );
}
