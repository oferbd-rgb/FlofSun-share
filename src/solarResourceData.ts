// Long-term-average (1999-2018, 20 years) monthly solar-resource sums for the Zohar, Israel site
// (31.588056 N, 34.706389 E) — the actual EDF Renewables project site this app models — extracted
// from Solargis report SG-63288-1906-7-1 (issued 26 June 2019). Index 0 = January ... 11 =
// December. Units: kWh/m^2 per month.
//
// This PDF report only contains these monthly/yearly SUMS — the full hourly time series and TMY
// (typical meteorological year, 8760 hourly records) it references are delivered as separate CSV
// files, not yet available to this project. irradiance.ts uses these monthly sums to calibrate
// (scale) its clear-sky model's magnitude per month for this specific site, rather than trusting
// an uncalibrated generic formula — swap in the real hourly/TMY CSV data instead, once available,
// for a proper (non-approximated) irradiance source.
export const ZOHAR_LATITUDE = 31.588056;
export const ZOHAR_LONGITUDE = 34.706389;

// Direct Normal Irradiation, kWh/m^2/month (report section 4, "DNI" table, LTA row).
export const ZOHAR_DNI_MONTHLY_KWH = [128, 126, 164, 176, 225, 265, 261, 237, 204, 160, 139, 133];
// Diffuse Horizontal Irradiation, kWh/m^2/month (report section 4, "DIF" table, LTA row).
export const ZOHAR_DHI_MONTHLY_KWH = [37, 43, 61, 70, 71, 58, 62, 62, 56, 55, 40, 34];
