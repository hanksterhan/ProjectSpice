import {
  defaultLibraryPreferences,
  type LibraryPreferences,
  type ThemePreference,
} from "./user-preferences.types";

import { UserPreferenceRepository } from "./user-preferences.repo";

export type UserPreferenceServiceRepository = Pick<
  UserPreferenceRepository,
  "getLibraryPreferences" | "setLibraryPreferences"
>;

export class UserPreferenceService {
  constructor(private readonly repository: UserPreferenceServiceRepository) {}

  async getLibraryPreferences(userId: string): Promise<LibraryPreferences> {
    return this.repository.getLibraryPreferences(userId);
  }

  async setCookbookDefaultVisibility(
    userId: string,
    cookbook: string,
    visible: boolean,
    updatedAt: string,
  ): Promise<LibraryPreferences> {
    const preferences = await this.getLibraryPreferences(userId);
    const hiddenCookbooks = new Set(preferences.hiddenCookbooks);

    if (visible) {
      hiddenCookbooks.delete(cookbook);
    } else {
      hiddenCookbooks.add(cookbook);
    }

    return this.repository.setLibraryPreferences(
      userId,
      {
        ...preferences,
        hiddenCookbooks: [...hiddenCookbooks].sort((left, right) => left.localeCompare(right)),
      },
      updatedAt,
    );
  }

  async setHideCookbooksByDefault(
    userId: string,
    hideCookbooksByDefault: boolean,
    updatedAt: string,
  ): Promise<LibraryPreferences> {
    const preferences = await this.getLibraryPreferences(userId);

    return this.repository.setLibraryPreferences(
      userId,
      {
        ...preferences,
        hideCookbooksByDefault,
      },
      updatedAt,
    );
  }

  async setThemePreference(
    userId: string,
    themeMode: ThemePreference,
    updatedAt: string,
  ): Promise<LibraryPreferences> {
    const preferences = await this.getLibraryPreferences(userId);

    return this.repository.setLibraryPreferences(
      userId,
      {
        ...preferences,
        themeMode,
      },
      updatedAt,
    );
  }

  async resetLibraryPreferences(
    userId: string,
    updatedAt: string,
  ): Promise<LibraryPreferences> {
    const preferences = await this.getLibraryPreferences(userId);

    return this.repository.setLibraryPreferences(
      userId,
      {
        ...preferences,
        hideCookbooksByDefault: defaultLibraryPreferences.hideCookbooksByDefault,
        hiddenCookbooks: defaultLibraryPreferences.hiddenCookbooks,
      },
      updatedAt,
    );
  }
}
