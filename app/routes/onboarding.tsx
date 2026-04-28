import { Form, redirect } from "react-router";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/onboarding";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { Chip } from "~/components/ui";

export function meta() {
  return [{ title: "Welcome — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);
  const fullUser = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
    columns: { onboardingCompletedAt: true },
  });
  if (fullUser?.onboardingCompletedAt) throw redirect("/");
  return { name: user.name };
}

// Handles path B: "start fresh" choices complete onboarding immediately.
export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const redirectTo = (formData.get("redirectTo") as string) || "/recipes/new";

  const { db } = createDb(context.cloudflare.env.DB);
  await db
    .update(schema.users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  throw redirect(redirectTo);
}

export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const firstName = loaderData.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                PS
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">ProjectSpice</p>
                <p className="text-xs text-ink-3">Family cookbook setup</p>
              </div>
            </div>

            <div className="space-y-4">
              <Chip tone="warning">Guided start</Chip>
              <h1 className="ps-display text-4xl text-ink sm:text-5xl">
                Welcome, {firstName}
              </h1>
              <p className="max-w-xl text-base text-ink-3">
                Start with a clean recipe, or migrate an existing Paprika library
                into a review flow that keeps confidence, warnings, and cookbook
                cleanup visible.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SetupMetric value="1" label="Choose a path" />
              <SetupMetric value="2" label="Review confidence" />
              <SetupMetric value="3" label="Cook from library" />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <a
              href="/imports/paprika"
              className="ps-surface group flex min-h-80 flex-col gap-5 p-5 transition hover:border-ink-4 hover:shadow-[var(--shadow-2)] focus-visible:ps-focus-ring"
            >
              <div className="space-y-3">
                <Chip tone="accent">Migration</Chip>
                <h2 className="ps-display text-2xl text-ink">Import from Paprika</h2>
                <p className="text-sm text-ink-3">
                  Bring over a large Paprika archive, then scan confidence,
                  warnings, photos, and cookbook organization before settling in.
                </p>
              </div>

              <div className="mt-auto space-y-3 rounded-md bg-paper-3 p-3">
                <p className="text-xs font-semibold uppercase text-ink-3">
                  Best for existing libraries
                </p>
                <div className="flex flex-wrap gap-2">
                  <Chip>Batch import</Chip>
                  <Chip>Review queue</Chip>
                  <Chip>Cookbook cleanup</Chip>
                </div>
                <p className="text-sm font-medium text-ink group-hover:text-primary">
                  Open Paprika importer
                </p>
              </div>
            </a>

            <div className="ps-surface flex min-h-80 flex-col gap-5 p-5">
              <div className="space-y-3">
                <Chip>Start fresh</Chip>
                <h2 className="ps-display text-2xl text-ink">Create your first recipe</h2>
                <p className="text-sm text-ink-3">
                  Complete setup now and land directly where you want to add the
                  first recipe: by hand, from a URL, or from a GPT-formatted paste.
                </p>
              </div>

              <div className="mt-auto space-y-2">
                <OnboardingExitButton redirectTo="/recipes/new">
                  Add manually
                </OnboardingExitButton>
                <div className="grid gap-2 sm:grid-cols-2">
                  <OnboardingExitButton redirectTo="/imports/url" variant="secondary">
                    From URL
                  </OnboardingExitButton>
                  <OnboardingExitButton redirectTo="/imports/gpt" variant="secondary">
                    GPT paste
                  </OnboardingExitButton>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function SetupMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-rule bg-paper-2 p-3">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </div>
  );
}

function OnboardingExitButton({
  redirectTo,
  children,
  variant = "primary",
}: {
  redirectTo: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Form method="post">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className={`ps-control w-full border px-4 text-sm font-medium transition-colors focus-visible:ps-focus-ring ${
          variant === "primary"
            ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
            : "border-rule bg-paper-2 text-ink hover:bg-paper-3"
        }`}
      >
        {children}
      </button>
    </Form>
  );
}
