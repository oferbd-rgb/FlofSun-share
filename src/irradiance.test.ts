import { describe, expect, it } from "vitest";
import {
  computeUnshadedGHI,
  createCalibratedClearSkyIrradianceProvider,
  createClearSkyIrradianceProvider,
} from "./irradiance";
import { ZOHAR_DHI_MONTHLY_KWH, ZOHAR_DNI_MONTHLY_KWH, ZOHAR_LATITUDE, ZOHAR_LONGITUDE } from "./solarResourceData";
import { getSunAngles } from "./sunPosition";

describe("createClearSkyIrradianceProvider", () => {
  const provider = createClearSkyIrradianceProvider();

  it("returns zero DNI/DHI when the sun is at or below the horizon", () => {
    expect(provider.getIrradiance(0, 6)).toEqual({ dni: 0, dhi: 0 });
    expect(provider.getIrradiance(-10, 6)).toEqual({ dni: 0, dhi: 0 });
  });

  it("increases DNI as the sun climbs higher (less air mass)", () => {
    const low = provider.getIrradiance(10, 6).dni;
    const mid = provider.getIrradiance(45, 6).dni;
    const high = provider.getIrradiance(90, 6).dni;
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("stays within a physically plausible range at zenith", () => {
    const { dni, dhi } = provider.getIrradiance(90, 6);
    expect(dni).toBeGreaterThan(700);
    expect(dni).toBeLessThan(1361);
    expect(dhi).toBeGreaterThan(0);
    expect(dhi).toBeLessThan(dni);
  });
});

describe("createCalibratedClearSkyIrradianceProvider", () => {
  // Reuses the Zohar dataset (real report figures) as a representative, non-trivial calibration
  // target rather than inventing synthetic numbers.
  const provider = createCalibratedClearSkyIrradianceProvider(
    ZOHAR_LATITUDE,
    ZOHAR_LONGITUDE,
    ZOHAR_DNI_MONTHLY_KWH,
    ZOHAR_DHI_MONTHLY_KWH,
  );

  it("still returns zero when the sun is at or below the horizon, for any month", () => {
    expect(provider.getIrradiance(0, 1)).toEqual({ dni: 0, dhi: 0 });
    expect(provider.getIrradiance(-5, 7)).toEqual({ dni: 0, dhi: 0 });
  });

  it("a full day's integrated DNI/DHI roughly matches the real average-daily total for that month", () => {
    // Integrating the provider's own output across a representative day should land close to the
    // monthly figure it was calibrated against (some residual error is expected: calibration
    // averages over a coarse 10-minute step and a single representative day per month).
    const monthIndex = 5; // June — index 5 in the monthly arrays
    const daysInJune = 30;
    const stepMinutes = 10;
    let totalDniWh = 0;
    let totalDhiWh = 0;
    for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
      const date = new Date(Date.UTC(2019, monthIndex, 15, 0, minutes));
      const { altitudeDeg } = getSunAngles(date, ZOHAR_LATITUDE, ZOHAR_LONGITUDE);
      if (altitudeDeg > 0) {
        const { dni, dhi } = provider.getIrradiance(altitudeDeg, monthIndex + 1);
        totalDniWh += dni * (stepMinutes / 60);
        totalDhiWh += dhi * (stepMinutes / 60);
      }
    }
    const realDniWhPerDay = (ZOHAR_DNI_MONTHLY_KWH[monthIndex] * 1000) / daysInJune;
    const realDhiWhPerDay = (ZOHAR_DHI_MONTHLY_KWH[monthIndex] * 1000) / daysInJune;
    expect(totalDniWh).toBeCloseTo(realDniWhPerDay, -1); // within ~tens of Wh/m^2/day
    expect(totalDhiWh).toBeCloseTo(realDhiWhPerDay, -1);
  });

  it("produces a different calibration scale for different months (seasonal variation)", () => {
    // Same altitude, different months, should generally NOT produce identical output, since each
    // month has its own calibration factor.
    const june = provider.getIrradiance(45, 6);
    const december = provider.getIrradiance(45, 12);
    expect(june.dni).not.toBeCloseTo(december.dni, 0);
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
