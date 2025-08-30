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
    return editor.document.fileName.split(/[\\/]/).pop() ?? "";
}

export function getParentUri(baseUri: vscode.Uri): vscode.Uri {
    const parentPath = baseUri.path.substring(0, baseUri.path.lastIndexOf("/"));
    const parentUri = baseUri.with({ path: parentPath });

    return parentUri;
}

// デバッグ情報表示用
const isDebug = process.env.VSCODE_DEBUG_MODE === "true";
const outputChannel = isDebug ? null : vscode.window.createOutputChannel("FontForge Glyph Preview");
export function writeDebugLog(message: string) {
    outputChannel?.appendLine(
        (new Date().toISOString()) + " [debug] > " + message,
    );
}
