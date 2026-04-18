import { describe, it, expect } from "vitest";
import { parseDuration, parseTimeString } from "../time-parser";

// ---------------------------------------------------------------------------
// parseDuration — unit tests
// ---------------------------------------------------------------------------

describe("parseDuration", () => {
  it("parses bare minutes: '30 min'", () => {
    expect(parseDuration("30 min")).toBe(30);
  });

  it("parses plural: '45 mins'", () => {
    expect(parseDuration("45 mins")).toBe(45);
  });

  it("parses 'minutes' spelling: '20 minutes'", () => {
    expect(parseDuration("20 minutes")).toBe(20);
  });

  it("parses hours only: '2 hours'", () => {
    expect(parseDuration("2 hours")).toBe(120);
  });

  it("parses 'hr' abbreviation: '1 hr'", () => {
    expect(parseDuration("1 hr")).toBe(60);
  });

  it("parses 'hrs' abbreviation: '2 hrs'", () => {
    expect(parseDuration("2 hrs")).toBe(120);
  });

  it("parses hours + minutes: '1 hr 30 min'", () => {
    expect(parseDuration("1 hr 30 min")).toBe(90);
  });

  it("parses hours + minutes long form: '1 hour 30 minutes'", () => {
    expect(parseDuration("1 hour 30 minutes")).toBe(90);
  });

  it("parses HH:MM: '1:30'", () => {
    expect(parseDuration("1:30")).toBe(90);
  });

  it("parses HH:MM zero hours: '0:45'", () => {
    expect(parseDuration("0:45")).toBe(45);
  });

  it("parses HH:MM round hours: '2:00'", () => {
    expect(parseDuration("2:00")).toBe(120);
  });

  it("parses bare integer as minutes: '90'", () => {
    expect(parseDuration("90")).toBe(90);
  });

  it("returns null for empty string", () => {
    expect(parseDuration("")).toBeNull();
  });

  it("returns null for day-scale 'days'", () => {
    expect(parseDuration("3 days")).toBeNull();
  });

  it("returns null for 'overnight'", () => {
    expect(parseDuration("overnight")).toBeNull();
  });

  it("returns null for 'months'", () => {
    expect(parseDuration("2 months")).toBeNull();
  });

  it("returns null for bare 'd' day abbreviation", () => {
    expect(parseDuration("1 d 40 mins")).toBeNull();
  });

  it("returns null for unrecognized text", () => {
    expect(parseDuration("see recipe")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseTimeString — fixture tests
// ---------------------------------------------------------------------------

describe("parseTimeString — simple durations", () => {
  it("'30 min' → total_min=30", () => {
    const r = parseTimeString("30 min");
    expect(r).toMatchObject({ total_min: 30, prep_min: null, active_min: null, time_notes: null });
  });

  it("'45 mins' → total_min=45", () => {
    expect(parseTimeString("45 mins").total_min).toBe(45);
  });

  it("'1 hour' → total_min=60", () => {
    expect(parseTimeString("1 hour").total_min).toBe(60);
  });

  it("'2 hours' → total_min=120", () => {
    expect(parseTimeString("2 hours").total_min).toBe(120);
  });

  it("'1 hr 30 min' → total_min=90", () => {
    expect(parseTimeString("1 hr 30 min").total_min).toBe(90);
  });

  it("'2 hrs 15 mins' → total_min=135", () => {
    expect(parseTimeString("2 hrs 15 mins").total_min).toBe(135);
  });

  it("'1 hour 30 minutes' → total_min=90", () => {
    expect(parseTimeString("1 hour 30 minutes").total_min).toBe(90);
  });

  it("'1:30' (HH:MM) → total_min=90", () => {
    expect(parseTimeString("1:30").total_min).toBe(90);
  });

  it("'0:45' (HH:MM) → total_min=45", () => {
    expect(parseTimeString("0:45").total_min).toBe(45);
  });

  it("bare integer '90' → total_min=90", () => {
    expect(parseTimeString("90").total_min).toBe(90);
  });
});

describe("parseTimeString — Active Time / Total Time (Paprika format)", () => {
  it("'Active Time: 30 min, Total Time: 1 hr'", () => {
    const r = parseTimeString("Active Time: 30 min, Total Time: 1 hr");
    expect(r.active_min).toBe(30);
    expect(r.total_min).toBe(60);
    expect(r.prep_min).toBeNull();
  });

  it("'ACTIVE TIME: 45 min, TOTAL TIME: 1:30' (uppercase)", () => {
    const r = parseTimeString("ACTIVE TIME: 45 min, TOTAL TIME: 1:30");
    expect(r.active_min).toBe(45);
    expect(r.total_min).toBe(90);
  });

  it("'Active Time: 20 Minutes, Total Time: 1 Hour 20 Minutes'", () => {
    const r = parseTimeString("Active Time: 20 Minutes, Total Time: 1 Hour 20 Minutes");
    expect(r.active_min).toBe(20);
    expect(r.total_min).toBe(80);
  });

  it("strips undefined prefix: 'undefinedACTIVE TIME: 20 min, TOTAL TIME: 1:30'", () => {
    const r = parseTimeString("undefinedACTIVE TIME: 20 min, TOTAL TIME: 1:30");
    expect(r.active_min).toBe(20);
    expect(r.total_min).toBe(90);
  });

  it("strips undefined prefix from plain duration: 'undefined30 min'", () => {
    expect(parseTimeString("undefined30 min").total_min).toBe(30);
  });

  it("Active Time alone: 'Active Time: 45 min'", () => {
    const r = parseTimeString("Active Time: 45 min");
    expect(r.active_min).toBe(45);
    expect(r.total_min).toBeNull();
  });

  it("Total Time alone: 'Total Time: 2 hrs'", () => {
    const r = parseTimeString("Total Time: 2 hrs");
    expect(r.total_min).toBe(120);
    expect(r.active_min).toBeNull();
  });
});

describe("parseTimeString — Prep / Cook labeled fields", () => {
  it("'Prep: 10 min, Cook: 45 min'", () => {
    const r = parseTimeString("Prep: 10 min, Cook: 45 min");
    expect(r.prep_min).toBe(10);
    expect(r.active_min).toBe(45);
  });

  it("'Prep 10 mins Cook 45 mins' (no colons)", () => {
    const r = parseTimeString("Prep 10 mins Cook 45 mins");
    expect(r.prep_min).toBe(10);
    expect(r.active_min).toBe(45);
  });

  it("'Prep Time: 20 minutes, Cook Time: 1 hour'", () => {
    const r = parseTimeString("Prep Time: 20 minutes, Cook Time: 1 hour");
    expect(r.prep_min).toBe(20);
    expect(r.active_min).toBe(60);
  });

  it("'Cook Time: 1 hour 30 minutes' (no prep field)", () => {
    const r = parseTimeString("Cook Time: 1 hour 30 minutes");
    expect(r.active_min).toBe(90);
    expect(r.prep_min).toBeNull();
  });

  it("'Prep: 15 min' alone", () => {
    const r = parseTimeString("Prep: 15 min");
    expect(r.prep_min).toBe(15);
    expect(r.active_min).toBeNull();
  });

  it("'Prep Time: 10 min, Cook Time: 30 min, Total Time: 40 min'", () => {
    const r = parseTimeString("Prep Time: 10 min, Cook Time: 30 min, Total Time: 40 min");
    expect(r.prep_min).toBe(10);
    expect(r.active_min).toBe(30);
    expect(r.total_min).toBe(40);
  });
});

describe("parseTimeString — narrative + duration", () => {
  it("'1 hour + overnight to marinate'", () => {
    const r = parseTimeString("1 hour + overnight to marinate");
    expect(r.total_min).toBe(60);
    expect(r.time_notes).toBe("1 hour + overnight to marinate");
  });

  it("'30 min + 1 hour chilling'", () => {
    const r = parseTimeString("30 min + 1 hour chilling");
    expect(r.total_min).toBe(30);
    expect(r.time_notes).toBeTruthy();
  });
});

describe("parseTimeString — day-scale → time_notes", () => {
  it("'up to 15 days'", () => {
    const r = parseTimeString("up to 15 days");
    expect(r.total_min).toBeNull();
    expect(r.time_notes).toBe("up to 15 days");
  });

  it("'2 months'", () => {
    const r = parseTimeString("2 months");
    expect(r.total_min).toBeNull();
    expect(r.time_notes).toBe("2 months");
  });

  it("'1 d 40 mins' (day abbreviation)", () => {
    const r = parseTimeString("1 d 40 mins");
    expect(r.total_min).toBeNull();
    expect(r.time_notes).toBeTruthy();
  });

  it("'overnight'", () => {
    const r = parseTimeString("overnight");
    expect(r.total_min).toBeNull();
    expect(r.time_notes).toBe("overnight");
  });

  it("'3 days'", () => {
    const r = parseTimeString("3 days");
    expect(r.total_min).toBeNull();
    expect(r.time_notes).toBe("3 days");
  });

  it("'up to 15 days' is not assigned total_min", () => {
    expect(parseTimeString("up to 15 days").total_min).toBeNull();
  });
});

describe("parseTimeString — unrecognized / fallback", () => {
  it("'varies' → time_notes='varies'", () => {
    const r = parseTimeString("varies");
    expect(r.time_notes).toBe("varies");
    expect(r.total_min).toBeNull();
  });

  it("'see recipe' → time_notes", () => {
    expect(parseTimeString("see recipe").time_notes).toBe("see recipe");
  });

  it("empty string → all null", () => {
    const r = parseTimeString("");
    expect(r).toEqual({ prep_min: null, active_min: null, total_min: null, time_notes: null });
  });

  it("whitespace only → all null", () => {
    const r = parseTimeString("   ");
    expect(r).toEqual({ prep_min: null, active_min: null, total_min: null, time_notes: null });
  });
});
