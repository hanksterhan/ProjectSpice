import { SignIn } from "@clerk/react-router";

import type { Route } from "./+types/sign-in";
import { useShellCommand } from "~/modules/ui-shell/AppShell";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign In | ProjectSpice" }];
}

export default function SignInRoute() {
  useShellCommand({
    title: "Sign In",
  });

  return (
    <section className="auth-route" aria-labelledby="sign-in-title">
      <h1 id="sign-in-title">Sign in</h1>
      <SignIn
        fallbackRedirectUrl="/"
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </section>
  );
}
