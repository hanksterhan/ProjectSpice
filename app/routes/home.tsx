import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "ProjectSpice" },
    { name: "description", content: "Your personal recipe manager" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return {
    environment: context.cloudflare.env.ENVIRONMENT,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-bold mb-4">🌶️ ProjectSpice</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Your personal recipe manager — coming soon.
        </p>
        <p className="text-sm text-muted-foreground">
          Environment: {loaderData.environment}
        </p>
      </div>
    </main>
  );
}
