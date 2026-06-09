import { redirect } from "react-router";

import type { Route } from "./+types/ai";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "New Recipe | ProjectSpice" }];
}

export function loader() {
  return redirect("/recipes/new?mode=chat");
}

export default function AiRedirectRoute() {
  return null;
}
