import * as vscode from "vscode";
import { writeDebugLog } from "./panel/util";
import { PreviewPanel } from "./panel/preview-panel";

export function activate(context: vscode.ExtensionContext) {
    writeDebugLog(`Extention is activated`);

    const previewPanel = new PreviewPanel(context);
    const disposable = vscode.commands.registerCommand(
        "fontforge-glyph-preview.showPreview",
        () => {
            writeDebugLog(`fontforge-glyph-preview.showPreview command is called`,);
            previewPanel.initialize();
        },
    );
    context.subscriptions.push(disposable);
}

export function deactivate() {}
