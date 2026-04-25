import {
  AlignLeft,
  Bell,
  CloudDownload,
  Download,
  Eye,
  EyeOff,
  Grid,
  List,
  Mail,
  RefreshCw,
  Settings,
  Smartphone,
  User,
  Vibrate,
  Volume2,
  WrapText,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type AsrSource, asrApi } from "@/api/asr";
import { preloadSpeechAssets } from "@/components/keyboard/core/sherpa-asr";
import { useFrameController } from "@/framework/frame/controller";
import { type Locale, useTranslation } from "@/lib/i18n";
import { getSettingsByCategory, SETTING_CATEGORIES, type SettingSchema, useSettingsStore } from "@/lib/settings";
import { requestTerminalNotificationPermission } from "@/services/terminal-notification-service";
import { useFrameStore } from "@/stores/frame-store";

const SettingItem: React.FC<{
  schema: SettingSchema;
  value: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
  sourceValue?: string;
  sourceOptions?: { value: string; label: string }[];
  onSourceChange?: (value: string) => void;
}> = ({ schema, value, onChange, t, sourceValue, sourceOptions, onSourceChange }) => {
  const getIcon = () => {
    switch (schema.key) {
      case "showHiddenFiles":
        return value === "true" ? <Eye size={18} /> : <EyeOff size={18} />;
      case "defaultViewMode":
        return value === "list" ? <List size={18} /> : <Grid size={18} />;
      case "editorWordWrap":
        return value === "true" ? <WrapText size={18} /> : <AlignLeft size={18} />;
      case "terminalDesktopNotifications":
        return <Bell size={18} />;
      case "gitUserName":
        return <User size={18} />;
      case "gitUserEmail":
        return <Mail size={18} />;
      case "gitDefaultCommitMessage":
        return <AlignLeft size={18} />;
      case "useNativeKeyboard":
        return <Smartphone size={18} />;
      case "keyboardHaptic":
        return <Vibrate size={18} />;
      case "keyboardSound":
        return <Volume2 size={18} />;
      case "speechAssets":
        return <CloudDownload size={18} />;
      default:
        return <Settings size={18} />;
    }
  };

  if (schema.type === "toggle") {
    const enabled = value === "true";

    return (
      <div className="flex items-center justify-between gap-4 p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`shrink-0 transition-colors ${enabled ? "text-ide-accent" : "text-ide-mute"}`}>
            {getIcon()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs leading-5 text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => onChange(enabled ? "false" : "true")}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus:border-ide-accent ${enabled ? "border-ide-accent bg-ide-accent/12" : "border-ide-border bg-ide-panel hover:border-ide-mute/40"}`}
        >
          <span
            className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border shadow-sm transition-all duration-200 ${enabled ? "translate-x-5 border-ide-accent bg-ide-accent" : "translate-x-0 border-ide-border bg-white"}`}
          />
        </button>
      </div>
    );
  }

  if (schema.type === "select" && schema.options) {
    return (
      <div className="p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {schema.options.map((opt) => {
            const label = opt.label.startsWith("settings.") ? t(opt.label) : opt.label;
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                  value === opt.value
                    ? "bg-ide-accent text-ide-bg border-ide-accent"
                    : "bg-ide-panel text-ide-text border-ide-border hover:border-ide-accent"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (schema.type === "number") {
    return (
      <div className="flex items-center justify-between p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={schema.min}
          max={schema.max}
          className="w-20 px-2 py-1 text-sm bg-ide-panel border border-ide-border rounded text-ide-text text-center"
        />
      </div>
    );
  }

  if (schema.type === "text") {
    return (
      <div className="p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(schema.labelKey)}
          className="w-full px-3 py-1.5 text-sm bg-ide-panel border border-ide-border rounded text-ide-text placeholder:text-ide-mute"
        />
      </div>
    );
  }

  if (schema.type === "action") {
    return (
      <div className="p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        {schema.key === "speechAssets" && sourceOptions && onSourceChange && (
          <div className="flex flex-wrap gap-2 mb-3">
            {sourceOptions.map((opt) => {
              const label = opt.label.startsWith("settings.") ? t(opt.label) : opt.label;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSourceChange(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                    sourceValue === opt.value
                      ? "bg-ide-accent text-ide-bg border-ide-accent"
                      : "bg-ide-panel text-ide-text border-ide-border hover:border-ide-accent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => onChange("run")}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border rounded-md transition-all bg-ide-panel text-ide-text border-ide-border hover:border-ide-accent"
        >
          <Download size={14} />
          {t("settings.speechAssets.button")}
        </button>
      </div>
    );
  }

  return null;
};

function speechSourceLabel(source: AsrSource): string {
  if (source.id === "official") return "settings.speechAssetSource.optionOfficial";
  if (source.id === "china") return "settings.speechAssetSource.optionChina";
  return source.label || source.id;
}

const SettingsPage: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const initSettings = useSettingsStore((s) => s.init);
  const updateSetting = useSettingsStore((s) => s.set);
  const locale = (settings.locale || "zh") as Locale;
  const t = useTranslation(locale);
  const { setTopBarConfig } = useFrameController();
  const removeGroup = useFrameStore((s) => s.removeGroup);
  const settingsGroup = useFrameStore((s) => s.groups.find((group) => group.type === "settings"));
  const setSettingsActiveCategory = useFrameStore((s) => s.setSettingsActiveCategory);

  const [downloadingSpeechAssets, setDownloadingSpeechAssets] = useState(false);
  const [speechSources, setSpeechSources] = useState<AsrSource[]>([]);
  const activeTab = settingsGroup?.activeCategory || SETTING_CATEGORIES[0].key;
  const speechSourceOptions = useMemo(() => {
    if (speechSources.length === 0) {
      return [
        { value: "auto", label: "settings.speechAssetSource.optionAuto" },
        { value: "official", label: "settings.speechAssetSource.optionOfficial" },
        { value: "china", label: "settings.speechAssetSource.optionChina" },
      ];
    }
    const sourceOptions = speechSources
      .filter((source) => source.id)
      .map((source) => ({ value: source.id, label: speechSourceLabel(source) }));
    return [{ value: "auto", label: "settings.speechAssetSource.optionAuto" }, ...sourceOptions];
  }, [speechSources]);

  const handleSettingChange = async (key: string, value: string) => {
    if (key === "speechAssets") {
      if (downloadingSpeechAssets) return;
      setDownloadingSpeechAssets(true);
      toast.loading(t("settings.speechAssets.downloading"), { id: "speech-assets-download" });
      try {
        await preloadSpeechAssets((status, progress) => {
          if (status === "loading") {
            toast.loading(progress || t("settings.speechAssets.downloading"), { id: "speech-assets-download" });
          }
        });
        toast.success(t("settings.speechAssets.downloaded"), { id: "speech-assets-download" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("settings.speechAssets.downloadFailed"), {
          id: "speech-assets-download",
        });
      } finally {
        setDownloadingSpeechAssets(false);
      }
      return;
    }
    if (key === "terminalDesktopNotifications" && value === "true") {
      void requestTerminalNotificationPermission();
    }
    void updateSetting(key, value);
  };

  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  useEffect(() => {
    void asrApi
      .info()
      .then((info) => {
        if (Array.isArray(info.sources)) setSpeechSources(info.sources);
      })
      .catch(() => setSpeechSources([]));
  }, []);

  const topBarCenterContent = useMemo(
    () => (
      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar touch-pan-x h-full">
        {SETTING_CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            onClick={() => setSettingsActiveCategory(cat.key)}
            className={`shrink-0 px-2 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
              activeTab === cat.key
                ? "bg-ide-panel border-ide-accent text-ide-accent border-b-2 shadow-sm"
                : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
            }`}
          >
            <span className="font-medium">{t(cat.labelKey)}</span>
          </div>
        ))}
      </div>
    ),
    [activeTab, setSettingsActiveCategory, t]
  );

  useEffect(() => {
    setTopBarConfig({
      show: true,
      leftButtons: [{ icon: <X size={18} />, onClick: () => removeGroup("settings") }],
      centerContent: topBarCenterContent,
      rightButtons: [
        {
          icon: <RefreshCw size={18} />,
          onClick: () => void initSettings(),
        },
      ],
    });
  }, [initSettings, removeGroup, setTopBarConfig, topBarCenterContent]);

  useEffect(() => {
    return () => setTopBarConfig({ show: false });
  }, [setTopBarConfig]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-ide-mute">{t("common.loading")}</div>
      </div>
    );
  }

  const categorySettings = getSettingsByCategory(activeTab).filter((schema) => schema.key !== "speechAssetSource");

  return (
    <div className="h-full overflow-y-auto bg-ide-bg">
      <div className="max-w-2xl mx-auto p-4">
        <div className="space-y-2">
          {categorySettings.map((schema) => (
            <SettingItem
              key={schema.key}
              schema={schema}
              value={settings[schema.key] || schema.defaultValue}
              onChange={(v) => void handleSettingChange(schema.key, v)}
              t={t}
              sourceValue={settings.speechAssetSource || "auto"}
              sourceOptions={schema.key === "speechAssets" ? speechSourceOptions : undefined}
              onSourceChange={
                schema.key === "speechAssets" ? (v) => void handleSettingChange("speechAssetSource", v) : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
