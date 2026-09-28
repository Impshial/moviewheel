// Shared by the CSS transition and the audio clock so clicks follow deceleration.
const X1 = 0.15;
const X2 = 0.12;
export const WHEEL_EASING = `cubic-bezier(${X1}, 0, ${X2}, 1)`;
export type WheelSpin = { from: number; to: number; count: number; duration: number };

export function wheelClickTimes({ from, to, count, duration }: WheelSpin): number[] {
  if (count < 1 || duration <= 0 || to <= from) return [];
  const step = 360 / count;
  const times: number[] = [];
  // The fixed pointer crosses a segment boundary at every whole step of rotation.
  // Exclude the starting boundary; it has not been passed during this spin.
  for (let boundary = Math.floor(from / step + 1e-9) + 1; boundary * step < to; boundary++) {
    const progress = (boundary * step - from) / (to - from);
    let lo = 0;
    let hi = 1;
    // Invert the Bezier's y coordinate (control points 0 and 1), then evaluate x.
    for (let iteration = 0; iteration < 40; iteration++) {
      const t = (lo + hi) / 2;
      if (3 * t * t - 2 * t * t * t < progress) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    const x = 3 * (1 - t) ** 2 * t * X1 + 3 * (1 - t) * t * t * X2 + t ** 3;
    times.push((x * duration) / 1000);
  }
  return times;
}
