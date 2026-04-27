import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const REQUIRED_ENVS = ["staging", "production"] as const;
const REQUIRED_SECRETS = [
  "SESSION_SECRET",
  "ANTHROPIC_OAUTH_TOKEN",
  "OPENAI_CODEX_TOKEN",
] as const;

type EnvironmentName = (typeof REQUIRED_ENVS)[number];

type WranglerConfig = {
  env?: Record<
    string,
    {
      name?: string;
      vars?: Record<string, string>;
      d1_databases?: Array<{
        binding?: string;
        database_name?: string;
        database_id?: string;
        migrations_dir?: string;
      }>;
      kv_namespaces?: Array<{ binding?: string; id?: string }>;
      r2_buckets?: Array<{ binding?: string; bucket_name?: string }>;
    }
  >;
};

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    output += char;
  }

  return output;
}

function loadConfig(): WranglerConfig {
  return JSON.parse(stripJsonComments(readFileSync("wrangler.jsonc", "utf8")));
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || /^REPLACE_WITH_|^local-|^local$/i.test(value);
}

function assertEnvConfig(config: WranglerConfig, envName: EnvironmentName): string[] {
  const errors: string[] = [];
  const env = config.env?.[envName];
  if (!env) return [`Missing env.${envName} in wrangler.jsonc`];

  if (!env.name) errors.push(`${envName}: missing Worker name`);
  if (env.vars?.ENVIRONMENT !== envName) {
    errors.push(`${envName}: vars.ENVIRONMENT must be "${envName}"`);
  }

  const db = env.d1_databases?.find((item) => item.binding === "DB");
  if (!db) {
    errors.push(`${envName}: missing D1 binding DB`);
  } else {
    if (!db.database_name) errors.push(`${envName}: D1 database_name is required`);
    if (isPlaceholder(db.database_id)) {
      errors.push(`${envName}: D1 database_id is still a placeholder`);
    }
    if (db.migrations_dir !== "./drizzle") {
      errors.push(`${envName}: D1 migrations_dir must be ./drizzle`);
    }
  }

  const kv = env.kv_namespaces?.find((item) => item.binding === "SESSIONS");
  if (!kv) {
    errors.push(`${envName}: missing KV binding SESSIONS`);
  } else if (isPlaceholder(kv.id)) {
    errors.push(`${envName}: KV namespace id is still a placeholder`);
  }

  const r2 = env.r2_buckets?.find((item) => item.binding === "IMAGES");
  if (!r2) {
    errors.push(`${envName}: missing R2 binding IMAGES`);
  } else if (!r2.bucket_name) {
    errors.push(`${envName}: R2 bucket_name is required`);
  }

  return errors;
}

function listRemoteSecrets(envName: EnvironmentName): Set<string> {
  const output = execFileSync(
    "pnpm",
    ["exec", "wrangler", "secret", "list", "--env", envName, "--format", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const parsed = JSON.parse(output) as Array<{ name?: string } | string>;
  return new Set(
    parsed
      .map((item) => (typeof item === "string" ? item : item.name))
      .filter((name): name is string => Boolean(name))
  );
}

const { values } = parseArgs({
  options: {
    env: { type: "string", multiple: true },
    "remote-secrets": { type: "boolean", default: false },
  },
});

const envs = (values.env?.length ? values.env : REQUIRED_ENVS) as EnvironmentName[];
const config = loadConfig();
const errors: string[] = [];

for (const envName of envs) {
  if (!REQUIRED_ENVS.includes(envName)) {
    errors.push(`Unsupported env "${envName}". Expected staging or production.`);
    continue;
  }

  errors.push(...assertEnvConfig(config, envName));

  if (values["remote-secrets"]) {
    try {
      const remoteSecrets = listRemoteSecrets(envName);
      for (const secretName of REQUIRED_SECRETS) {
        if (!remoteSecrets.has(secretName)) {
          errors.push(`${envName}: missing remote secret ${secretName}`);
        }
      }
    } catch (error) {
      errors.push(`${envName}: could not list remote secrets (${String(error)})`);
    }
  }
}

if (errors.length) {
  console.error("Cloudflare readiness check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Cloudflare readiness check passed for ${envs.join(", ")}${
    values["remote-secrets"] ? " with remote secrets" : ""
  }.`
);
