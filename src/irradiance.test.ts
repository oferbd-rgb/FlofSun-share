import { describe, expect, it } from "vitest";
import { computeUnshadedGHI, createClearSkyIrradianceProvider } from "./irradiance";

describe("createClearSkyIrradianceProvider", () => {
  const provider = createClearSkyIrradianceProvider();

  it("returns zero DNI/DHI when the sun is at or below the horizon", () => {
    expect(provider.getIrradiance(0)).toEqual({ dni: 0, dhi: 0 });
    expect(provider.getIrradiance(-10)).toEqual({ dni: 0, dhi: 0 });
  });

  it("increases DNI as the sun climbs higher (less air mass)", () => {
    const low = provider.getIrradiance(10).dni;
    const mid = provider.getIrradiance(45).dni;
    const high = provider.getIrradiance(90).dni;
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("stays within a physically plausible range at zenith", () => {
    const { dni, dhi } = provider.getIrradiance(90);
    expect(dni).toBeGreaterThan(700);
    expect(dni).toBeLessThan(1361);
    expect(dhi).toBeGreaterThan(0);
    expect(dhi).toBeLessThan(dni);
  });
});

describe("computeUnshadedGHI", () => {
  it("matches the standard DNI*cos(incidence) + DHI decomposition, cos(incidence)=sunDirY for a horizontal surface", () => {
    expect(computeUnshadedGHI(800, 100, 0.7)).toBeCloseTo(800 * 0.7 + 100);
  });

  it("is exactly DHI when the sun contributes no vertical component", () => {
    expect(computeUnshadedGHI(800, 100, 0)).toBeCloseTo(100);
  });
});
