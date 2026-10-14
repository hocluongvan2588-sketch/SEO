import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_UI_LOCALE, UI_LOCALES, type UiLocale } from "@/lib/locales";

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("ui_locale")?.value;
  const locale: UiLocale = UI_LOCALES.includes(raw as UiLocale) ? (raw as UiLocale) : DEFAULT_UI_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Ho_Chi_Minh",
  };
});
