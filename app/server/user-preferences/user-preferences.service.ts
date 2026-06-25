import {
  defaultLibraryPreferences,
  type LibraryPreferences,
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

  async resetLibraryPreferences(
    userId: string,
    updatedAt: string,
  ): Promise<LibraryPreferences> {
    return this.repository.setLibraryPreferences(
      userId,
      defaultLibraryPreferences,
      updatedAt,
    );
  }
}
