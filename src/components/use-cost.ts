"use client";

import { useFormatter, useTranslations } from "next-intl";

/** "Chi phí ước tính: $0.0312" — hiện sau mỗi thao tác tốn phí */
export function useCostLabel() {
  const t = useTranslations("common");
  const format = useFormatter();
  return (usd?: number) =>
    usd && usd > 0
      ? t("cost", { cost: format.number(usd, { style: "currency", currency: "USD", maximumFractionDigits: usd < 1 ? 4 : 2 }) })
      : undefined;
}
