import * as vscode from "vscode";
import { initializeDebugLog, writeDebugLog } from "./panel/util";
import { Preview } from "./panel/preview";
import { ComparePanel } from "./panel/compare-panel";

import { findTargetDocument, getTargetDocument } from "./panel/documents";

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


    // ファイル比較コマンド
    const compareCommand = vscode.commands.registerCommand(
        "fontforge-glyph-preview.compareFiles",
        async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
            // 2つのファイルが選択されている場合のみ比較
            writeDebugLog(`fontforge-glyph-preview.showPreview command is called`,);
            const targets = uris ? uris : [uri];
            if (targets.length === 2) {
                const document0 = await getTargetDocument(targets[0]);
                const document1 = await getTargetDocument(targets[1]);
                const comparePanel = new ComparePanel(context, [document0, document1]);
            } else {
                vscode.window.showInformationMessage("Please select two SFD files to compare.");
            }
        }
    );
    context.subscriptions.push(compareCommand);

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
