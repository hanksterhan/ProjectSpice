import { describe, expect, it, vi } from "vitest";

import {
  defaultLibraryPreferences,
  type LibraryPreferences,
} from "../user-preferences.types";
import {
  UserPreferenceService,
  type UserPreferenceServiceRepository,
} from "../user-preferences.service";

describe("UserPreferenceService", () => {
  it("persists theme preference without clearing library defaults", async () => {
    const repository = createRepositoryDouble({
      ...defaultLibraryPreferences,
      hiddenCookbooks: ["Author - Cookbook"],
    });
    const service = new UserPreferenceService(repository);

    await expect(
      service.setThemePreference("user-1", "dark", "2026-06-27T10:00:00.000Z"),
    ).resolves.toEqual({
      hideCookbooksByDefault: false,
      hiddenCookbooks: ["Author - Cookbook"],
      themeMode: "dark",
    });
    expect(repository.setLibraryPreferences).toHaveBeenCalledWith(
      "user-1",
      {
        hideCookbooksByDefault: false,
        hiddenCookbooks: ["Author - Cookbook"],
        themeMode: "dark",
      },
      "2026-06-27T10:00:00.000Z",
    );
  });

  it("resets cookbook visibility without clearing theme preference", async () => {
    const repository = createRepositoryDouble({
      hideCookbooksByDefault: true,
      hiddenCookbooks: ["Author - Cookbook"],
      themeMode: "light",
    });
    const service = new UserPreferenceService(repository);

    await expect(
      service.resetLibraryPreferences("user-1", "2026-06-27T10:00:00.000Z"),
    ).resolves.toEqual({
      hideCookbooksByDefault: false,
      hiddenCookbooks: [],
      themeMode: "light",
    });
  });
});

function createRepositoryDouble(
  preferences: LibraryPreferences,
): UserPreferenceServiceRepository {
  let currentPreferences = preferences;

  return {
    getLibraryPreferences: vi.fn(async () => currentPreferences),
    setLibraryPreferences: vi.fn(async (_userId, nextPreferences) => {
      currentPreferences = {
        hideCookbooksByDefault: nextPreferences.hideCookbooksByDefault,
        hiddenCookbooks: [...nextPreferences.hiddenCookbooks],
        themeMode: nextPreferences.themeMode,
      };

      return currentPreferences;
    }),
  };
}
