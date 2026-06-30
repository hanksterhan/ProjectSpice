import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ScreenWakeLockToggle,
  getScreenWakeLockStatusLabel,
} from "../ScreenWakeLockToggle";

describe("ScreenWakeLockToggle", () => {
  it("renders an accessible stay-awake toggle", () => {
    const markup = renderToStaticMarkup(<ScreenWakeLockToggle />);

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Keep screen awake");
    expect(markup).toContain("Off");
    expect(markup).toContain('aria-describedby="');
  });

  it("formats wake lock status labels", () => {
    expect(
      getScreenWakeLockStatusLabel({
        enabled: false,
        isActivePage: true,
        isSupported: true,
        status: "off",
      }),
    ).toBe("Off");
    expect(
      getScreenWakeLockStatusLabel({
        enabled: true,
        isActivePage: true,
        isSupported: true,
        status: "active",
      }),
    ).toBe("Active");
    expect(
      getScreenWakeLockStatusLabel({
        enabled: true,
        isActivePage: true,
        isSupported: true,
        status: "requesting",
      }),
    ).toBe("Starting");
    expect(
      getScreenWakeLockStatusLabel({
        enabled: true,
        isActivePage: true,
        isSupported: true,
        status: "error",
      }),
    ).toBe("Blocked");
    expect(
      getScreenWakeLockStatusLabel({
        enabled: true,
        isActivePage: false,
        isSupported: true,
        status: "off",
      }),
    ).toBe("Recipe pages only");
    expect(
      getScreenWakeLockStatusLabel({
        enabled: true,
        isActivePage: true,
        isSupported: false,
        status: "off",
      }),
    ).toBe("Unavailable");
  });
});
