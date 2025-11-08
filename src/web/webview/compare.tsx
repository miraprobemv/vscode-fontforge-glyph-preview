import {} from "./types/global";
import React from "react";
import { createRoot } from "react-dom/client";
import { VscodeProvider } from "./hooks/vscode-api";
import { CompareGlyphStoreProvider } from "./hooks/compare-glyph-store";
import { CompareApp } from "./components/compare/compare-app";

const vscode = acquireVsCodeApi();

const rootEl = document.getElementById("root") ?? (() => {
    const el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
    return el;
})();
createRoot(rootEl).render(
    <VscodeProvider vscodeApi={vscode}>
        <CompareGlyphStoreProvider>
            <CompareApp />
        </CompareGlyphStoreProvider>
    </VscodeProvider>
);