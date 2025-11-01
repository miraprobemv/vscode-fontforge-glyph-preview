import * as vscode from "vscode";
import { getDocumentName } from "./util";

export async function findTargetDocument(uri: vscode.Uri | undefined): Promise<vscode.TextDocument | undefined> {
    if (uri) {
        let findingDocument: vscode.TextDocument | undefined;
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri === uri) {
                findingDocument = editor.document;
                break;
            }
        }
        if (findingDocument) {
            return findingDocument;
        } else {
            return await vscode.workspace.openTextDocument(uri);
        }
    } else {
        const editorWhenCommandCalled = vscode.window.activeTextEditor;
        // アクティブなテキストエディタがなかったりそれ以外のパネルを開いている場合はエラーメッセージを表示する。（多分コマンド実行のみ）
        if (!editorWhenCommandCalled) {
            vscode.window.showErrorMessage("No active text editor found.");
            return undefined;
        }
        // アクティブなテキストエディタがサポート対象外のファイル形式の場合もエラーメッセージを表示する。（多分コマンド実行のみ）
        if (editorWhenCommandCalled.document.languageId !== "sfd") {
            vscode.window.showErrorMessage(`This file type is not supported: "${getDocumentName(editorWhenCommandCalled.document)}".`,);
            return undefined;
        }
        return editorWhenCommandCalled.document; 
    }
}