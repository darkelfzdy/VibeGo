import type { PageDefinition } from "@/pages/types";

export function getNewPageVisibilitySettingKey(page: PageDefinition): string {
  return page.newPageSettingKey || `newPage.visible.${page.id}`;
}

export function isPageVisibleInNewPage(page: PageDefinition, settings: Record<string, string>): boolean {
  const value = settings[getNewPageVisibilitySettingKey(page)];
  if (value === "true") return true;
  if (value === "false") return false;
  return page.newPageDefaultVisible ?? true;
}
