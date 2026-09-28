import { describe, expect, it } from "vitest";
import { targetRotation } from "@/lib/domain";
import { wheelClickTimes } from "@/lib/wheel-timing";

describe("wheel click timing", () => {
  it("uses the animation curve rather than evenly spaced clicks", () => {
    // At Bezier parameter 0.5, y=0.5 and x=0.22625 for the wheel's curve.
    const times = wheelClickTimes({ from: 0, to: 720, count: 1, duration: 6500 });
    expect(times).toHaveLength(1);
    expect(times[0]).toBeCloseTo(6.5 * 0.22625, 8);
  });
  it.each([1, 2, 4, 29])(
    "clicks once per crossed segment for %i movies, including repeat spins",
    (count) => {
      let from = 0;
      for (const selected of [0, count - 1, 0]) {
        const to = targetRotation(from, selected, count);
        const times = wheelClickTimes({ from, to, count, duration: 6500 });
        expect(times).toHaveLength(
          Math.floor(to / (360 / count)) - Math.floor(from / (360 / count)),
        );
        expect(
          times.every((time, i) => time > 0 && time < 6.5 && (!i || time > times[i - 1])),
        ).toBe(true);
        expect(times.at(-1)! - times.at(-2)!).toBeGreaterThan(times[2] - times[1]);
        from = to;
      }
    },
  );
  it("does not produce fake ticks for an empty wheel or an instant reduced-motion spin", () => {
    expect(wheelClickTimes({ from: 0, to: 2340, count: 0, duration: 6500 })).toEqual([]);
    expect(wheelClickTimes({ from: 0, to: 2340, count: 4, duration: 0 })).toEqual([]);
  });
});
