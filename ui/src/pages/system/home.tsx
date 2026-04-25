import { Home } from "lucide-react";
import React from "react";
import { HomePage } from "@/components/home";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";
import { useAppStore } from "@/stores/app-store";
import { useSessionStore } from "@/stores/session-store";

const HomeView: React.FC<PageViewProps> = () => {
  const locale = useAppStore((s) => s.locale);
  const openFolder = useSessionStore((s) => s.openFolder);

  return <HomePage locale={locale} onOpenFolder={openFolder} />;
};

registerPage({
  id: "home",
  name: "Home",
  nameKey: "common.home",
  icon: Home,
  category: "system",
  order: 0,
  View: HomeView,
});

export default HomeView;
