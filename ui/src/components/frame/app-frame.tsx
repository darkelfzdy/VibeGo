import React from "react";
import BottomBar from "@/components/frame/bottom-bar";
import SideBar from "@/components/frame/side-bar";
import TabBar from "@/components/frame/tab-bar";
import TopBar from "@/components/frame/top-bar";
import { Keyboard } from "@/components/keyboard";
import { useFrameStore } from "@/stores/frame-store";

interface AppFrameProps {
  children: React.ReactNode;
  onMenuOpen?: () => void;
  onRefresh?: () => void;
  onBackToList?: () => void;
  onNewPage?: () => void;
}

const AppFrame: React.FC<AppFrameProps> = ({ children, onMenuOpen, onRefresh, onBackToList, onNewPage }) => {
  const topBarConfig = useFrameStore((s) => s.topBarConfig);

  return (
    <div className="h-dvh min-h-dvh flex bg-ide-bg text-ide-text overflow-hidden font-mono transition-colors duration-300">
      <SideBar onMenuClick={onMenuOpen} onNewPage={onNewPage} />
      <div className="flex-1 flex flex-col min-w-0">
        {topBarConfig.show ? <TopBar /> : <TabBar onRefresh={onRefresh} onBackToList={onBackToList} />}
        <main className="flex-1 overflow-hidden relative">{children}</main>
        <Keyboard />
        <BottomBar onMenuClick={onMenuOpen} onNewPage={onNewPage} />
      </div>
    </div>
  );
};

export default AppFrame;
