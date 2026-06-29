import {
  defaultLibraryPreferences,
  type LibraryPreferences,
  type ThemePreference,
  themePreferenceOptions,
} from "./user-preferences.types";

export type UserPreferenceRepositoryStatement = {
  bind(...values: unknown[]): UserPreferenceRepositoryStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
};

export type UserPreferenceRepositoryDatabase = {
  prepare(query: string): UserPreferenceRepositoryStatement;
};

type UserPreferenceRow = {
  value_json: string | LibraryPreferences;
};

const libraryPreferenceKey = "library";

export class UserPreferenceRepository {
  constructor(private readonly database: UserPreferenceRepositoryDatabase) {}

  async getLibraryPreferences(userId: string): Promise<LibraryPreferences> {
    const row = await this.database
      .prepare(
        `SELECT value_json
        FROM user_preferences
        WHERE user_id = ? AND preference_key = ?
        LIMIT 1`,
      )
      .bind(userId, libraryPreferenceKey)
      .first<UserPreferenceRow>();

    return row ? parseLibraryPreferences(row.value_json) : defaultLibraryPreferences;
  }

  async setLibraryPreferences(
    userId: string,
    preferences: LibraryPreferences,
    updatedAt: string,
  ): Promise<LibraryPreferences> {
    await this.database
      .prepare(
        `INSERT INTO user_preferences (
          user_id,
          preference_key,
          value_json,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, preference_key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        userId,
        libraryPreferenceKey,
        JSON.stringify(preferences),
        updatedAt,
      )
      .run();

    return preferences;
  }
}

function parseLibraryPreferences(value: string | LibraryPreferences): LibraryPreferences {
  const rawValue =
    typeof value === "string" ? (JSON.parse(value) as Partial<LibraryPreferences>) : value;

  return {
    hideCookbooksByDefault:
      typeof rawValue.hideCookbooksByDefault === "boolean"
        ? rawValue.hideCookbooksByDefault
        : defaultLibraryPreferences.hideCookbooksByDefault,
    hiddenCookbooks: Array.isArray(rawValue.hiddenCookbooks)
      ? [
          ...new Set(
            rawValue.hiddenCookbooks.filter(
              (item): item is string => typeof item === "string",
            ),
          ),
        ]
      : [],
    themeMode: isThemePreference(rawValue.themeMode)
      ? rawValue.themeMode
      : defaultLibraryPreferences.themeMode,
  };
}

function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferenceOptions.includes(value as ThemePreference);
}
