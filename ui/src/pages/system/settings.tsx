import { Settings } from "lucide-react";
import React from "react";
import { SettingsPage } from "@/components/settings";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";

const SettingsView: React.FC<PageViewProps> = () => {
  return <SettingsPage />;
};

registerPage({
  id: "settings",
  name: "Settings",
  nameKey: "common.settings",
  icon: Settings,
  category: "system",
  order: 1,
  View: SettingsView,
});

export default SettingsView;
