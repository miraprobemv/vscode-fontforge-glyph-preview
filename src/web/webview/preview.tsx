import {} from "./types/global";
import React from "react";
import { createRoot } from "react-dom/client";
import { VscodeProvider } from "./hooks/vscode-api";
import { PreviewSettingsProvider } from "./hooks/preview-settings";
import { PreviewApp } from "./components/preview/preview-app";

const vscode = acquireVsCodeApi();

const rootEl = document.getElementById("root") ?? (() => {
    const el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
    return el;
})();
createRoot(rootEl).render(
    <VscodeProvider vscodeApi={vscode}>
        <PreviewSettingsProvider>
            <PreviewApp />
        </PreviewSettingsProvider>
    </VscodeProvider>
);