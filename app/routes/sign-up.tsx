import { SignUp } from "@clerk/react-router";

import type { Route } from "./+types/sign-up";
import { useShellCommand } from "~/modules/ui-shell/AppShell";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign Up | ProjectSpice" }];
}

export default function SignUpRoute() {
  useShellCommand({
    title: "Sign Up",
  });

  return (
    <section className="auth-route" aria-labelledby="sign-up-title">
      <h1 id="sign-up-title">Sign up</h1>
      <SignUp
        fallbackRedirectUrl="/"
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    </section>
  );
}
