// Pure math — no three.js dependency.
//
// Direct Normal Irradiance (DNI) and Diffuse Horizontal Irradiance (DHI), in W/m^2, are what
// groundRadiation.ts needs to turn tracker/sun geometry into an actual radiation number. This app
// has no live weather data source (sunPosition.ts only gives sun angles, via suncalc) — real
// measured DNI/DHI (e.g. from the Israel Meteorological Service's Envista API, which needs a
// personal API token obtained directly from IMS) is a planned follow-up, not implemented yet.
//
// IrradianceProvider is the seam for that: everything downstream only depends on this interface,
// so swapping the clear-sky fallback below for a real data-backed provider (fetching/caching
// measured 10-minute readings, deriving DNI from GHI/DHI where a station only reports those) will
// be a small, isolated change — it just needs to implement this same shape.
export interface IrradianceProvider {
  getIrradiance(altitudeDeg: number): { dni: number; dhi: number };
}

const SOLAR_CONSTANT_W_M2 = 1361; // extraterrestrial direct normal irradiance

// Simple clear-sky approximation (Meinel & Meinel 1976 form): DNI falls off with air mass raised
// to a fixed power, air mass itself approximated as 1/sin(altitude) (accurate away from the
// horizon; this whole model is explicitly a stand-in for real measured data, not a precision
// atmospheric model). DHI is taken as a fixed fraction of DNI, scaled by sin(altitude) — a rough
// but physically reasonable clear-sky diffuse estimate (real diffuse fractions vary a lot with
// aerosols/humidity, which is exactly the kind of thing real IMS station data would capture and
// this fallback can't).
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

// GHI (Global Horizontal Irradiance) on a flat, unshaded, horizontal surface decomposes exactly
// into DNI * cos(incidence) + DHI — and for a horizontal surface, cos(incidence) = sin(altitude)
// (the sun direction's own "up" component, i.e. sunAzElToVector3(...).y). Used as the "unshaded
// GHI" denominator that groundRadiation.ts's percent-of-GHI figures are relative to.
export function computeUnshadedGHI(dni: number, dhi: number, sunDirY: number): number {
  return dni * sunDirY + dhi;
}
