/** Ngôn ngữ giao diện */
export const UI_LOCALES = ["vi", "en"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_UI_LOCALE: UiLocale = "vi";

/** Ngôn ngữ nội dung SEO mà một dự án có thể nhắm tới */
export const CONTENT_LOCALES: { code: string; label: string; country: string }[] = [
  { code: "vi", label: "Tiếng Việt", country: "vn" },
  { code: "en", label: "English", country: "us" },
  { code: "ja", label: "日本語", country: "jp" },
  { code: "ko", label: "한국어", country: "kr" },
  { code: "zh", label: "中文", country: "cn" },
  { code: "th", label: "ไทย", country: "th" },
  { code: "id", label: "Bahasa Indonesia", country: "id" },
  { code: "fr", label: "Français", country: "fr" },
  { code: "de", label: "Deutsch", country: "de" },
  { code: "es", label: "Español", country: "es" },
];

export const COUNTRIES: { code: string; label: string }[] = [
  { code: "vn", label: "Việt Nam" },
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "sg", label: "Singapore" },
  { code: "jp", label: "Japan" },
  { code: "kr", label: "Korea" },
  { code: "cn", label: "China" },
  { code: "th", label: "Thailand" },
  { code: "id", label: "Indonesia" },
  { code: "au", label: "Australia" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
];

export function localeLabel(code: string) {
  return CONTENT_LOCALES.find((l) => l.code === code)?.label ?? code;
}
