import { SignUp } from "@clerk/react-router";

import type { Route } from "./+types/sign-up";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign up | ProjectSpice" }];
}

export default function SignUpRoute() {
  return (
    <section className="auth-route" aria-label="ProjectSpice sign up">
      <SignUp
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
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    </section>
  );
}
