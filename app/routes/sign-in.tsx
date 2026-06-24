import { SignIn } from "@clerk/react-router";

import type { Route } from "./+types/sign-in";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign in | ProjectSpice" }];
}

export default function SignInRoute() {
  return (
    <section className="auth-route" aria-label="ProjectSpice sign in">
      <SignIn
        appearance={{
          elements: {
            card: "clerk-card",
            footer: "clerk-footer",
            formButtonPrimary: "clerk-primary-button",
            headerTitle: "clerk-header-title",
            rootBox: "clerk-root-box",
          },
        }}
        fallbackRedirectUrl="/"
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </section>
  );
}
