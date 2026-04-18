import { Blocks } from "lucide-react";
import React from "react";
import BlockTermPage from "@/components/terminal/blockterm-page";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";

const BlockTermView: React.FC<PageViewProps> = ({ context }) => {
  return <BlockTermPage groupId={context.groupId} />;
};

registerPage({
  id: "blockterm",
  name: "BlockTerm",
  nameKey: "plugin.blockTerm.name",
  icon: Blocks,
  category: "tool",
  order: 15,
  singleton: true,
  View: BlockTermView,
});

export default BlockTermView;
