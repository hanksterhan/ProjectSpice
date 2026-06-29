export const themePreferenceOptions = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferenceOptions)[number];

export type LibraryPreferences = {
  hideCookbooksByDefault: boolean;
  hiddenCookbooks: string[];
  themeMode: ThemePreference;
};

export const defaultLibraryPreferences: LibraryPreferences = {
  hideCookbooksByDefault: false,
  hiddenCookbooks: [],
  themeMode: "system",
};
