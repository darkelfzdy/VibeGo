import { AlertCircle, Code, Download, FileQuestion, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { fileApi } from "@/api/file";
import CodePreview from "@/components/preview/code-preview";
import ImagePreview from "@/components/preview/image-preview";
import MarkdownPreview from "@/components/preview/markdown-preview";
import MediaPreview from "@/components/preview/media-preview";
import PDFPreview from "@/components/preview/pdf-preview";
import { formatFileSize, isFileTooLarge } from "@/components/preview/utils";
import { useTranslation } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import type { FileItem } from "@/stores/file-manager-store";
import { getPreviewType, usePreviewStore } from "@/stores/preview-store";

interface FilePreviewProps {
  file: FileItem | null;
}

const FilePreview: React.FC<FilePreviewProps> = ({ file }) => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const [openAsCode, setOpenAsCode] = useState(false);
  const { loading, error, setFile, setContent, setOriginalContent, setLoading, setError, setEditMode, reset } =
    usePreviewStore();

  useEffect(() => {
    if (!file) {
      reset();
      return;
    }

    setFile(file);
    setOpenAsCode(false);
    const previewType = getPreviewType(file.mimeType, file.extension);

    if (previewType === "code" || previewType === "markdown") {
      if (isFileTooLarge(file.size, "text")) {
        setError(`${t("preview.fileTooLargeToPreview")} (${formatFileSize(file.size)})`);
        return;
      }

      setLoading(true);
      setError(null);

      fileApi
        .read(file.path)
        .then((res) => {
          setContent(res.content);
          setOriginalContent(res.content);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : t("preview.loadFailed"));
        })
        .finally(() => {
          setLoading(false);
        });
    }

    return () => {
      setEditMode(false);
    };
  }, [file?.path, setContent, setEditMode, setError, setFile, setLoading, setOriginalContent, reset, t]);

  const loadFileAsCode = () => {
    if (!file) return;
    if (isFileTooLarge(file.size, "text")) {
      setError(`${t("preview.fileTooLargeToOpen")} (${formatFileSize(file.size)})`);
      return;
    }
    setLoading(true);
    setError(null);
    fileApi
      .read(file.path)
      .then((res) => {
        setContent(res.content);
        setOriginalContent(res.content);
        setOpenAsCode(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("preview.loadFailed"));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-ide-mute gap-4">
        <FileQuestion size={48} className="opacity-50" />
        <p className="text-sm">{t("preview.selectFile")}</p>
      </div>
    );
  }

  const previewType = getPreviewType(file.mimeType, file.extension);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-ide-accent" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-500 gap-2 p-4">
        <AlertCircle size={32} />
        <p className="text-sm text-center">{error}</p>
      </div>
    );
  }

  const renderContent = () => {
    if (openAsCode) {
      return <CodePreview />;
    }
    switch (previewType) {
      case "code":
        return <CodePreview />;
      case "image":
        return <ImagePreview />;
      case "video":
      case "audio":
        return <MediaPreview />;
      case "markdown":
        return <MarkdownPreview />;
      case "pdf":
        return <PDFPreview />;
      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-ide-mute gap-4 p-4">
            <FileQuestion size={48} className="opacity-50" />
            <p className="text-sm">{t("preview.notAvailable")}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={loadFileAsCode}
                className="flex items-center gap-2 px-4 py-2 bg-ide-panel border border-ide-border text-ide-text rounded text-sm hover:bg-ide-bg"
              >
                <Code size={18} />
                {t("preview.openAsText")}
              </button>
              <a
                href={fileApi.downloadUrl(file.path)}
                download={file.name}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-ide-accent text-ide-bg rounded text-sm hover:opacity-90"
              >
                <Download size={18} />
                {t("preview.download")}
              </a>
            </div>
          </div>
        );
    }
  };

  return <div className="h-full flex flex-col overflow-hidden">{renderContent()}</div>;
};

export default FilePreview;
