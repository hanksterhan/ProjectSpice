import {
  getCloudflareRuntimeContext,
  type RuntimeLoadContext,
} from "~/server/runtime-context";

import {
  UserPreferenceRepository,
  type UserPreferenceRepositoryDatabase,
} from "./user-preferences.repo";
import { UserPreferenceService, type UserPreferenceServiceRepository } from "./user-preferences.service";
import {
  defaultLibraryPreferences,
  type LibraryPreferences,
} from "./user-preferences.types";

type MaybeD1Env = Record<string, unknown> & {
  DB?: UserPreferenceRepositoryDatabase;
  ENVIRONMENT?: string;
  RECIPE_DB?: UserPreferenceRepositoryDatabase;
  PROJECTSPICE_RECIPE_STORAGE?: string;
};

let memoryRepository: MemoryUserPreferenceRepository | undefined;

export function getUserPreferenceService(context: RuntimeLoadContext): UserPreferenceService {
  const database = getBoundPreferenceDatabase(context);

  if (database) {
    return new UserPreferenceService(new UserPreferenceRepository(database));
  }

  assertCanUseMemoryPreferenceStorage(context);
  memoryRepository ??= new MemoryUserPreferenceRepository();

  return new UserPreferenceService(memoryRepository);
}

function getBoundPreferenceDatabase(
  context: RuntimeLoadContext,
): UserPreferenceRepositoryDatabase | undefined {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;

  if (
    env.PROJECTSPICE_RECIPE_STORAGE === "memory" ||
    process.env.PROJECTSPICE_RECIPE_STORAGE === "memory"
  ) {
    return undefined;
  }

  return env.RECIPE_DB ?? env.DB;
}

function assertCanUseMemoryPreferenceStorage(context: RuntimeLoadContext): void {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;
  const environment = env.ENVIRONMENT ?? process.env.ENVIRONMENT;

  if (environment !== "development") {
    throw new Error(
      "User preference persistence is not configured. Bind RECIPE_DB before running outside development.",
    );
  }
}

class MemoryUserPreferenceRepository implements UserPreferenceServiceRepository {
  private readonly libraryPreferences = new Map<string, LibraryPreferences>();

  async getLibraryPreferences(userId: string): Promise<LibraryPreferences> {
    return clonePreferences(
      this.libraryPreferences.get(userId) ?? defaultLibraryPreferences,
    );
  }

  async setLibraryPreferences(
    userId: string,
    preferences: LibraryPreferences,
    _updatedAt: string,
  ): Promise<LibraryPreferences> {
    this.libraryPreferences.set(userId, clonePreferences(preferences));

    return clonePreferences(preferences);
  }
}

function clonePreferences(preferences: LibraryPreferences): LibraryPreferences {
  return {
    hideCookbooksByDefault: preferences.hideCookbooksByDefault,
    hiddenCookbooks: [...preferences.hiddenCookbooks],
    themeMode: preferences.themeMode,
  };
}
