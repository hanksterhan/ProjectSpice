import { redirect } from "react-router";

import type { Route } from "./+types/preferences.cookbooks";
import { requireAuthenticatedUser } from "~/server/auth";
import { getUserPreferenceService } from "~/server/user-preferences";

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireAuthenticatedUser({ request, context, params: {} });
  const formData = await request.formData();
  const intent = formData.get("intent");
  const cookbook = String(formData.get("cookbook") ?? "").trim();
  const visible = formData.get("visible") === "1";
  const redirectTo = getSafeRedirectPath(String(formData.get("redirectTo") ?? "/"));
  const service = getUserPreferenceService(context);

  if (intent === "reset-library") {
    await service.resetLibraryPreferences(user.userId, new Date().toISOString());

    return redirect(redirectTo);
  }

  if (!cookbook) {
    return redirect(redirectTo);
  }

  await service.setCookbookDefaultVisibility(
    user.userId,
    cookbook,
    visible,
    new Date().toISOString(),
  );

  return redirect(redirectTo);
}

function getSafeRedirectPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
