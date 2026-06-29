import type { Route } from "./+types/preferences.settings";
import { requireAuthenticatedUser } from "~/server/auth";
import {
  getUserPreferenceService,
  type ThemePreference,
  themePreferenceOptions,
} from "~/server/user-preferences";

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireAuthenticatedUser({ request, context, params: {} });
  const formData = await request.formData();
  const intent = formData.get("intent");
  const service = getUserPreferenceService(context);
  const updatedAt = new Date().toISOString();

  if (intent === "set-theme") {
    const preferences = await service.setThemePreference(
      user.userId,
      parseThemePreference(formData.get("themeMode")),
      updatedAt,
    );

    return json({ preferences });
  }

  if (intent === "set-hide-cookbooks-by-default") {
    const preferences = await service.setHideCookbooksByDefault(
      user.userId,
      formData.get("hideCookbooksByDefault") === "1",
      updatedAt,
    );

    return json({ preferences });
  }

  return json({ errors: ["Choose a settings action."] }, 400);
}

function parseThemePreference(value: FormDataEntryValue | null): ThemePreference {
  return themePreferenceOptions.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
