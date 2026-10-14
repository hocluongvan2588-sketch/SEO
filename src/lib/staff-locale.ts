import "server-only";
import { getLocale } from "next-intl/server";

export async function staffLocale() {
  return (await getLocale()) || "vi";
}
