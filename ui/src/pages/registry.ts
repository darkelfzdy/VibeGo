import type { PageDefinition, PageId } from "@/pages/types";

class PageRegistry {
  private pages: Map<PageId, PageDefinition> = new Map();

  register(page: PageDefinition): void {
    this.pages.set(page.id, page);
  }

  unregister(id: PageId): void {
    this.pages.delete(id);
  }

  get(id: PageId): PageDefinition | undefined {
    return this.pages.get(id);
  }

  getAll(): PageDefinition[] {
    return Array.from(this.pages.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }
}

export const pageRegistry = new PageRegistry();

export function registerPage(page: PageDefinition): void {
  pageRegistry.register(page);
}

export function unregisterPage(id: PageId): void {
  pageRegistry.unregister(id);
}
