import { describe, expect, it } from "vitest";
import { humanizeAge } from "./humanizeAge";

describe("humanizeAge", () => {
  it("rounds to the nearest minute between 45s and 1h", () => {
    expect(humanizeAge(44)).toBe("just now");
    expect(humanizeAge(45)).toBe("1 min ago");
    expect(humanizeAge(90)).toBe("2 min ago");
    expect(humanizeAge(3599)).toBe("60 min ago");
  });

  it("rounds to the nearest hour between 1h and 1 day", () => {
    expect(humanizeAge(3600)).toBe("1 h ago");
    expect(humanizeAge(86399)).toBe("24 h ago");
  });

  it("rounds to the nearest day beyond 1 day", () => {
    expect(humanizeAge(86400)).toBe("1 days ago");
    expect(humanizeAge(200_000)).toBe("2 days ago");
  });
});
