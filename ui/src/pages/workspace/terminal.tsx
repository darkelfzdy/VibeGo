import { Terminal } from "lucide-react";
import React from "react";
import { TerminalPage } from "@/components/terminal";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";

const TerminalWorkspaceView: React.FC<PageViewProps> = ({ context }) => {
  return <TerminalPage groupId={context.groupId} cwd={context.path} />;
};

registerPage({
  id: "terminal",
  name: "Terminal",
  nameKey: "sidebar.terminal",
  icon: Terminal,
  category: "workspace",
  order: 1,
  View: TerminalWorkspaceView,
});

export default TerminalWorkspaceView;
