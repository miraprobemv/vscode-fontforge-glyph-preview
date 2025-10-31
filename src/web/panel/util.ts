import * as vscode from "vscode";

export function generateNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const charLength = chars.length;
    let nonce = "";
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * charLength));
    }
    return nonce;
}

export function getTabName(editor: vscode.TextEditor): string {
    return getFileBaseName(editor.document.fileName);
}

export function getFileBaseName(fileName: string): string {
    return fileName.split(/[\\/]/).pop() ?? "";
}

export function isUnderDirectory(uri: vscode.Uri, dirUri: vscode.Uri): boolean {
    return uri.fsPath.startsWith(dirUri.fsPath);
}

export function getParentUri(baseUri: vscode.Uri): vscode.Uri {
    const parentPath = baseUri.path.substring(0, baseUri.path.lastIndexOf("/"));
    const parentUri = baseUri.with({ path: parentPath });

    return parentUri;
}

export function sleep(millisec: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(
            () => { resolve(); },
            millisec
        );
    });
}

// デバッグ情報表示用
let outputChannel: vscode.OutputChannel | null =  null;

export function initializeDebugLog(extensionMode: vscode.ExtensionMode) {
    if (extensionMode === vscode.ExtensionMode.Production) { return; }
    outputChannel = vscode.window.createOutputChannel("FontForge Glyph Preview");
}

export function writeDebugLog(message: string) {
    outputChannel?.appendLine(
        (new Date().toISOString()) + " [debug] > " + message,
    );
}
