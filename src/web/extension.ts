import * as vscode from "vscode";
import { initializeDebugLog, writeDebugLog } from "./panel/util";
import { Preview } from "./panel/preview";

let eventSubscription: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
    initializeDebugLog(context.extensionMode);
    writeDebugLog(`Extention is activated`);

    const preview = new Preview();

    const openPreviewCommand = vscode.commands.registerCommand(
        "fontforge-glyph-preview.openPreview",
        (uri?: vscode.Uri) => preview.open(context, uri),
    );
    context.subscriptions.push(openPreviewCommand);
    
    const openPreviewToSideCommand = vscode.commands.registerCommand(
        "fontforge-glyph-preview.openPreviewToSide",
        (uri?: vscode.Uri) => preview.open(context, uri, vscode.ViewColumn.Beside),
    );
    context.subscriptions.push(openPreviewToSideCommand);

    // 設定変更を監視する。
    eventSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
        preview.handleDidChangeConfiguration(e);
    });
}

export function deactivate() {
    if (eventSubscription) {
        eventSubscription.dispose();
        eventSubscription = undefined;
    }
}
