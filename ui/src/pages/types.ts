import type { LucideIcon } from "lucide-react";
import type React from "react";

export type PageId = string;

export type PageCategory = "workspace" | "tool" | "system";

export interface PageContext {
  groupId: string;
  tabId: string | null;
  isActive: boolean;
  path?: string;
}

export interface PageViewProps {
  context: PageContext;
}

export interface PageDefinition {
  id: PageId;
  name: string;
  nameKey?: string;
  descriptionKey?: string;
  icon: LucideIcon;
  category: PageCategory;
  order?: number;
  singleton?: boolean;
  newPageSettingKey?: string;
  newPageDefaultVisible?: boolean;
  tags?: { labelKey: string }[];
  View: React.ComponentType<PageViewProps>;
}
