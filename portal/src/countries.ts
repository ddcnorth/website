/** ISO 3166-1 alpha-2 codes; names come from the browser (Intl.DisplayNames). */
const CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

let names: Intl.DisplayNames | null = null;
export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  try {
    names ??= new Intl.DisplayNames(undefined, { type: "region" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export interface Country { code: string; name: string }

let all: Country[] | null = null;
export function countries(): Country[] {
  all ??= CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
  return all;
}

/** Regional-indicator emoji flag for a code. */
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🏳";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export const COUNTRY_PRESETS: [string, string[]][] = [
  ["Canada", ["CA"]],
  ["Canada + US", ["CA", "US"]],
  ["North America", ["CA", "US", "MX"]],
];

export function describeCountries(list: string[], max = 3): string {
  if (!list.length) return "Anywhere";
  const named = list.map(countryName);
  return named.length > max ? `${named.slice(0, max).join(", ")} +${named.length - max}` : named.join(", ");
}
