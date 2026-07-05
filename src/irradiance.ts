// Direct Normal Irradiance (DNI) and Diffuse Horizontal Irradiance (DHI), in W/m^2, are what
// groundRadiation.ts needs to turn tracker/sun geometry into an actual radiation number. This app
// still has no live, per-timestamp weather data source — real hourly/TMY measurements (a Solargis
// report, SG-63288-1906-7-1, references CSV files with exactly that for this project's actual
// site, Zohar, Israel, but only the report's monthly *summary* tables have been provided so far,
// not those CSVs) is a planned follow-up, not implemented yet.
//
// IrradianceProvider is the seam for that: everything downstream only depends on this interface,
// so swapping either provider below for a real data-backed one (fetching/interpolating the actual
// hourly/TMY series once those CSV files are available) will be a small, isolated change — it
// just needs to implement this same shape.
import { getSunAngles } from "./sunPosition";
import { ZOHAR_DHI_MONTHLY_KWH, ZOHAR_DNI_MONTHLY_KWH, ZOHAR_LATITUDE, ZOHAR_LONGITUDE } from "./solarResourceData";

export interface IrradianceProvider {
  // month is 1-indexed (1=January), matching appState.ts's DateState convention.
  getIrradiance(altitudeDeg: number, month: number): { dni: number; dhi: number };
}

const SOLAR_CONSTANT_W_M2 = 1361; // extraterrestrial direct normal irradiance

// Simple clear-sky approximation (Meinel & Meinel 1976 form): DNI falls off with air mass raised
// to a fixed power, air mass itself approximated as 1/sin(altitude) (accurate away from the
// horizon; this whole model is explicitly a stand-in for real measured data, not a precision
// atmospheric model). DHI is taken as a fixed fraction of DNI, scaled by sin(altitude) — a rough
// but physically reasonable clear-sky diffuse estimate (real diffuse fractions vary a lot with
// aerosols/humidity, which is exactly the kind of thing real site data would capture and this
// fallback can't). Ignores month entirely — see createCalibratedClearSkyIrradianceProvider below
// for a version that's actually tuned to a specific site's real seasonal averages.
const CLEAR_SKY_DNI_COEFFICIENT = 0.7;
const CLEAR_SKY_DNI_EXPONENT = 0.678;
const CLEAR_SKY_DIFFUSE_FRACTION = 0.1;

export function createClearSkyIrradianceProvider(): IrradianceProvider {
  return {
    getIrradiance(altitudeDeg: number) {
      if (altitudeDeg <= 0) return { dni: 0, dhi: 0 };
      const sinAltitude = Math.sin((altitudeDeg * Math.PI) / 180);
      const airMass = 1 / sinAltitude;
      const dni = SOLAR_CONSTANT_W_M2 * Math.pow(CLEAR_SKY_DNI_COEFFICIENT, Math.pow(airMass, CLEAR_SKY_DNI_EXPONENT));
      const dhi = CLEAR_SKY_DIFFUSE_FRACTION * dni * sinAltitude;
      return { dni, dhi };
    },
  };
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CALIBRATION_STEP_MINUTES = 10;
const CALIBRATION_REFERENCE_YEAR = 2019; // arbitrary — only the calendar date/latitude matter for day length

// Scales createClearSkyIrradianceProvider's raw output, per month, so that a representative day's
// DNI/DHI integrated over daylight hours matches a real site's known long-term-average MONTHLY
// total (see solarResourceData.ts) — grounding the clear-sky model's magnitude in real regional
// data instead of trusting its generic, uncalibrated coefficients. Still an approximation (the
// monthly figures are averages, not per-timestamp measurements, and only one representative day
// per month is integrated), but a meaningfully better one than the plain clear-sky provider —
// treat it as an interim step until real hourly/TMY data for this site is wired in.
//
// The two calibration factors (one for DNI, one for DHI) are computed once, at creation time, by
// numerically integrating the raw provider's output across a representative (the 15th) day of
// each month at the given latitude/longitude, and comparing the result to
// monthlyKWh[month] / daysInMonth[month] (i.e. the real average-daily total for that month).
function computeMonthlyCalibrationFactors(
  latitude: number,
  longitude: number,
  monthlyKWh: number[],
  extract: (irradiance: { dni: number; dhi: number }) => number,
): number[] {
  const rawProvider = createClearSkyIrradianceProvider();
  const factors: number[] = [];

  for (let month = 0; month < 12; month++) {
    let predictedWhPerDay = 0;
    for (let minutes = 0; minutes < 24 * 60; minutes += CALIBRATION_STEP_MINUTES) {
      const date = new Date(Date.UTC(CALIBRATION_REFERENCE_YEAR, month, 15, 0, minutes));
      const { altitudeDeg } = getSunAngles(date, latitude, longitude);
      if (altitudeDeg > 0) {
        predictedWhPerDay += extract(rawProvider.getIrradiance(altitudeDeg, month + 1)) * (CALIBRATION_STEP_MINUTES / 60);
      }
    }
    const realWhPerDay = (monthlyKWh[month] * 1000) / DAYS_IN_MONTH[month];
    factors.push(predictedWhPerDay > 0 ? realWhPerDay / predictedWhPerDay : 1);
  }

  return factors;
}

export function createCalibratedClearSkyIrradianceProvider(
  latitude: number,
  longitude: number,
  dniMonthlyKWh: number[],
  dhiMonthlyKWh: number[],
): IrradianceProvider {
  const rawProvider = createClearSkyIrradianceProvider();
  const dniScaleByMonth = computeMonthlyCalibrationFactors(latitude, longitude, dniMonthlyKWh, (i) => i.dni);
  const dhiScaleByMonth = computeMonthlyCalibrationFactors(latitude, longitude, dhiMonthlyKWh, (i) => i.dhi);

  return {
    getIrradiance(altitudeDeg: number, month: number) {
      const monthIndex = Math.min(11, Math.max(0, Math.round(month) - 1));
      const { dni, dhi } = rawProvider.getIrradiance(altitudeDeg, month);
      return { dni: dni * dniScaleByMonth[monthIndex], dhi: dhi * dhiScaleByMonth[monthIndex] };
    },
  };
}

// Ready-made provider calibrated against this project's actual site (Zohar, Israel) — the default
// used by main.ts and sunHoursReport.ts. Only strictly valid at/near that site; if the location
// picker is used to move elsewhere, treat its output as a rough order-of-magnitude figure, not a
// site-specific one.
export const zoharIrradianceProvider = createCalibratedClearSkyIrradianceProvider(
  ZOHAR_LATITUDE,
  ZOHAR_LONGITUDE,
  ZOHAR_DNI_MONTHLY_KWH,
  ZOHAR_DHI_MONTHLY_KWH,
);

// GHI (Global Horizontal Irradiance) on a flat, unshaded, horizontal surface decomposes exactly
// into DNI * cos(incidence) + DHI — and for a horizontal surface, cos(incidence) = sin(altitude)
// (the sun direction's own "up" component, i.e. sunAzElToVector3(...).y). Used as the "unshaded
// GHI" denominator that groundRadiation.ts's percent-of-GHI figures are relative to.
export function computeUnshadedGHI(dni: number, dhi: number, sunDirY: number): number {
  return dni * sunDirY + dhi;
}
