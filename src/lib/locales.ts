/** Ngôn ngữ giao diện */
export const UI_LOCALES = ["vi", "en"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_UI_LOCALE: UiLocale = "vi";

/**
 * Ngôn ngữ nội dung SEO (mã dùng cho Google `hl` và hreflang).
 * `country` là thị trường gợi ý mặc định khi chọn ngôn ngữ đó.
 */
export const CONTENT_LOCALES: { code: string; country: string }[] = [
  { code: "vi", country: "vn" },
  { code: "en", country: "us" },
  { code: "ja", country: "jp" },
  { code: "ko", country: "kr" },
  { code: "zh-CN", country: "cn" },
  { code: "zh-TW", country: "tw" },
  { code: "zh-HK", country: "hk" },
  { code: "th", country: "th" },
  { code: "id", country: "id" },
  { code: "ms", country: "my" },
  { code: "fil", country: "ph" },
  { code: "km", country: "kh" },
  { code: "lo", country: "la" },
  { code: "my", country: "mm" },
  { code: "hi", country: "in" },
  { code: "bn", country: "bd" },
  { code: "ar", country: "sa" },
  { code: "he", country: "il" },
  { code: "tr", country: "tr" },
  { code: "fa", country: "ir" },
  { code: "ru", country: "ru" },
  { code: "uk", country: "ua" },
  { code: "pl", country: "pl" },
  { code: "cs", country: "cz" },
  { code: "ro", country: "ro" },
  { code: "hu", country: "hu" },
  { code: "el", country: "gr" },
  { code: "de", country: "de" },
  { code: "fr", country: "fr" },
  { code: "es", country: "es" },
  { code: "it", country: "it" },
  { code: "pt", country: "pt" },
  { code: "pt-BR", country: "br" },
  { code: "nl", country: "nl" },
  { code: "sv", country: "se" },
  { code: "da", country: "dk" },
  { code: "no", country: "no" },
  { code: "fi", country: "fi" },
  { code: "sw", country: "ke" },
];

/** Toàn bộ quốc gia/vùng lãnh thổ (ISO 3166-1 alpha-2) — dùng cho Google `gl`. */
export const COUNTRY_CODES = (
  "ad ae af ag ai al am ao ar as at au aw az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cd cf cg ch ci ck cl cm cn co cr cu cv cy cz de dj dk dm do dz ec ee eg es et fi fj fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gt gu gy hk hn hr ht hu id ie il im in iq ir is it je jm jo jp ke kg kh ki km kn kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mk ml mm mn mo mq mr ms mt mu mv mw mx my mz na nc ne ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pr ps pt py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st sv sy sz tc td tg th tj tk tl tm tn to tr tt tw tz ua ug us uy uz vc ve vg vi vn vu ws ye yt za zm zw"
).split(" ");

/** Nhóm thị trường phổ biến cho doanh nghiệp Việt Nam xuất khẩu / mở rộng. */
export const POPULAR_MARKETS = ["vn", "us", "gb", "au", "ca", "sg", "jp", "kr", "cn", "tw", "th", "my", "id", "ph", "in", "ae", "de", "fr", "nl"];

/** Mã ngôn ngữ chính (vd: "pt-BR" → "pt") — dùng để so khớp hreflang. */
export function baseLang(code: string) {
  return code.toLowerCase().split("-")[0];
}

/** Mã `hl` cho Google (Google dùng zh-CN, zh-TW, pt-BR...). */
export function googleHl(code: string) {
  return code;
}

const displayCache = new Map<string, Intl.DisplayNames>();
function displayNames(uiLocale: string, type: "language" | "region") {
  const key = `${uiLocale}:${type}`;
  let dn = displayCache.get(key);
  if (!dn) {
    dn = new Intl.DisplayNames([uiLocale, "en"], { type });
    displayCache.set(key, dn);
  }
  return dn;
}

export function languageName(code: string, uiLocale = "vi") {
  try {
    return displayNames(uiLocale, "language").of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryName(code: string, uiLocale = "vi") {
  try {
    return displayNames(uiLocale, "region").of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Cờ emoji từ mã quốc gia. */
export function flag(code: string) {
  if (!/^[a-z]{2}$/i.test(code)) return "🌐";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Danh sách quốc gia đã sắp xếp theo tên trong ngôn ngữ giao diện. */
export function sortedCountries(uiLocale: string) {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, uiLocale) })).sort((a, b) =>
    a.name.localeCompare(b.name, uiLocale),
  );
}

export function defaultCountryFor(locale: string) {
  return CONTENT_LOCALES.find((l) => l.code === locale)?.country;
}

/** Tương thích ngược */
export function localeLabel(code: string, uiLocale = "vi") {
  return languageName(code, uiLocale);
}
