import { Bot } from "lucide-react";
import React from "react";
import AISessionManagerPage from "@/components/ai-session/ai-session-manager-page";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";

const AISessionManagerView: React.FC<PageViewProps> = () => {
  return <AISessionManagerPage />;
};

registerPage({
  id: "ai-session-manager",
  name: "AI Sessions",
  nameKey: "plugin.aiSessionManager.name",
  descriptionKey: "plugin.aiSessionManager.description",
  icon: Bot,
  category: "tool",
  order: 20,
  singleton: true,
  View: AISessionManagerView,
});

export default AISessionManagerView;
