import { useCallback } from "react";
import en from "@/lib/i18n/locales/en.json";
import zh from "@/lib/i18n/locales/zh.json";

export type Locale = "en" | "zh";

type Translations = typeof en;

const locales: Record<Locale, Translations> = { en, zh };

export function getIntlLocale(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

export function getTranslation(locale: Locale, key: string): string {
  const keys = key.split(".");
  let result: unknown = locales[locale];
  for (const k of keys) {
    result = (result as Record<string, unknown>)?.[k];
  }
  return (result as string) ?? key;
}

export function useTranslation(locale: Locale) {
  return useCallback((key: string): string => getTranslation(locale, key), [locale]);
}

export { locales };
