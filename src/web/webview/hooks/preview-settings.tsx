import React from "react";
import { PreviewSettings } from "../../common/types";


type PreviewSettingsContextType = { previewSettings: PreviewSettings; setPreviewSettings: React.Dispatch<React.SetStateAction<PreviewSettings>> };
const initialState: PreviewSettings = {
    displayType: "metrics",
    showsCurvatureCombs: false,
};
const PreviewSettingsContext = React.createContext<PreviewSettingsContextType>({ previewSettings: initialState, setPreviewSettings: () => {} });

export function PreviewSettingsProvider({ children }: { children: React.ReactNode }) {
  const [previewSettings, setPreviewSettings] = React.useState<PreviewSettings>(initialState);
  return <PreviewSettingsContext.Provider value={{ previewSettings, setPreviewSettings }}>{children}</PreviewSettingsContext.Provider>;
}

export function usePreviewSettings(): PreviewSettingsContextType {
    const ctx = React.useContext(PreviewSettingsContext);
    if (!ctx) {
        throw new Error("usePreviewSettings must be used within a PreviewSettingsProvider");
    }
    return ctx;
}
