import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "ProjectSpice V1" }];
}

const upcomingModules = [
  "recipe-domain",
  "library",
  "recipe-editor",
  "recipe-viewer",
  "ai-workbench",
];

export default function Home() {
  return (
    <main className="app-frame">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">V1 rebuild scaffold</p>
          <h1 id="hero-title">ProjectSpice</h1>
          <p>
            A focused recipe workbench for creating, editing, viewing, and refining
            structured recipes with AI support.
          </p>
        </div>
        <div className="status-panel" aria-label="Milestone status">
          <span>Milestone 1</span>
          <strong>Minimal Cloudflare scaffold</strong>
          <p>React Router, Worker entrypoint, and build tooling are active.</p>
        </div>
      </section>

      <section className="module-band" aria-labelledby="module-title">
        <div>
          <p className="eyebrow">Next modules</p>
          <h2 id="module-title">Small pieces before broad features.</h2>
        </div>
        <ul>
          {upcomingModules.map((moduleName) => (
            <li key={moduleName}>{moduleName}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
