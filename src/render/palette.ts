/** Render colours (placeholder art, GD §21: 탑뷰 2D). Data, not logic. */
export const ZONE_COLOR: Readonly<Record<string, [number, number, number]>> = Object.freeze({
  plain: [122, 150, 84], forest: [58, 110, 62], hill: [150, 128, 92], field: [176, 160, 82],
  wetland: [78, 120, 104], reservoir: [86, 104, 124], base: [170, 160, 150],
});
export const NO_ZONE: [number, number, number] = [110, 120, 110];
/** Depth bands (DETAILED §13.1): < 0.02 clear, ≤ 0.3 sky, ≤ 1.0 blue, > 1.0 navy + stripes. */
export const WATER = { clear: 0.02, shallow: 0.3, deep: 1.0 } as const;
export const WATER_RGB = { sky: [120, 200, 255], blue: [40, 110, 220], navy: [20, 40, 120] } as const;
export const ICE_RGB = [220, 245, 255] as const;
/** Water being removed (B3): pumped (teal, with a moving stripe) and soaked up (green). */
export const DRAIN_RGB = [40, 230, 170] as const, SOAK_RGB = [110, 200, 120] as const;
export const LEVEE = '#8a6a44', LEVEE_WEAK = '#d0433a', TEMP_WALL = '#c8b27a';
export const PUMP_ON = '#38e0c8', PUMP_OFF = '#55606c', GATE_OPEN = '#9ad', GATE_CLOSED = '#e8c25a';
export const HIGHLIGHT = '#ffffff', DIM = 'rgba(8,14,24,0.55)', INLET_ARROW = 'rgba(120,200,255,0.9)';
