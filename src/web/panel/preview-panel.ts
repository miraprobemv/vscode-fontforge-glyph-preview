import * as vscode from "vscode";
import { generateNonce, getTabName, getParentUri, writeDebugLog } from "./util";
import { getGlyphFileDataAsync } from "./sfd";
import { postMessage, returnMessageAsync } from "./interop";

export class PreviewPanel {
    private context: vscode.ExtensionContext;

    // パネルを全体で1つしか表示しないため、情報を保持しておく。
    private panel: vscode.WebviewPanel | undefined;
    private currentEditor: vscode.TextEditor | undefined;
    private currentUri: vscode.Uri | undefined;
    private currentVersion: number | undefined;
    private currentGlyph: string | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    initialize() {
        // プレビューのパネルがアクティブなときにコマンド実行された場合は何もしない。
        if (this.panel && this.panel.active) { return; }

        const editorWhenCommandCalled = vscode.window.activeTextEditor;
        // アクティブなテキストエディタがなかったりそれ以外のパネルを開いている場合はエラーメッセージを表示する。（多分コマンド実行のみ）
        if (!editorWhenCommandCalled) {
            vscode.window.showErrorMessage("No active text editor found.");
            return;
        }
        // アクティブなテキストエディタがサポート対象外のファイル形式の場合もエラーメッセージを表示する。（多分コマンド実行のみ）
        if (editorWhenCommandCalled.document.languageId !== "sfd") {
            vscode.window.showErrorMessage(`This file type is not supported: "${getTabName(editorWhenCommandCalled)}".`,);
            return;
        }
        this.currentEditor = editorWhenCommandCalled;

        // すでにパネルが存在する場合はそれを表示する。（2つ以上プレビューを表示しない）
        if (this.tryReusePanel()) { return; }

        // パネルがない場合は追加してセットアップをする。
        this.panel = this.initializeWebviewPanel();
    }

    private initializeWebviewPanel(): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            "fontforgeGlyphPreview",
            "FontForge Glyph Preview",
            vscode.ViewColumn.Beside,
            { enableScripts: true },
        );

        // Webview からのメッセージ受信設定は WebView のコンテンツを設定する前にしておく。
        panel.webview.onDidReceiveMessage(async (message) => {
            if (!this.panel) { return; }

            switch (message.type) {
                case "ready":
                    // Webview の初期化が完了したタイミングで初期表示を行う。
                    // WebView は背面に行ったときにタブの内容が破棄される。
                    // アクティブになった時に再びタブの内容が作られて ready メッセージが投げられるため注意する。
                    this.showWebviewFirstView();
                    break;
                case "storeCurrentGlyphName":
                    // 表示中グリフ情報を保存する。
                    this.storeCurrentGlyphName(message.params.name);
                    break;
                case "fetchGlyphDataFromOtherFile":
                    // 追加のグリフ情報を取得する。
                    await returnMessageAsync(
                        this.panel,
                        message,
                        async (params) => await this.fetchGlyphDataFromOtherFile(params.gid),
                    );
                    break;
                case "writeDebugLog":
                    // デバッグメッセージの表示。
                    writeDebugLog(message.params.message);
                    break;
            }
        });

        // 現在プレビューしているドキュメントが更新された場合はプレビュー内容を更新する。
        vscode.workspace.onDidChangeTextDocument((event) =>
            this.onDidChangeTextDocument(event)
        );

        // 別のドキュメントに切り替わった時にプレビューを更新する。
        // プレビュー対象外のドキュメントから現在プレビュー中のドキュメントに戻ってきた場合、更新がなければプレビューを更新しない。
        vscode.window.onDidChangeActiveTextEditor((editor) =>
            this.onDidChangeActiveTextEditor(editor)
        );

        // WebView のコンテンツを設定する。
        panel.webview.html = this.initializeHtmlContent(panel);

        panel.onDidDispose(() => {
            this.panel = undefined;
        });

        return panel;
    }

    private initializeHtmlContent(panel: vscode.WebviewPanel): string {
        const nonce = generateNonce();
        const cspSource = panel.webview.cspSource;
        const cssUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css")
        );
        const jsUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "dist", "web", "webview.js")
        );

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta
                    http-equiv="Content-Security-Policy"
                    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource};"
                />
                <link rel="stylesheet" href="${cssUri}">
            </head>
            <body class="preview-body">
                <header class="header">
                    <div class="file-name-container">
                        <span id="file-name" class="file-name"></span>
                    </div>
                    <div class="glyph-name-container">
                        <button type="button" id="open-side-menu-button" class="open-side-menu-button">&gt;</button>
                        <span class="glyph-name-title">Glyph Name: </span><span id="glyph-name" class="glyph-name"></span>
                    </div>
                </header>
                <aside id="side-menu" class="side-menu _closed">
                    <div id="glyph-list-container" class="glyph-list-container"></div>
                </aside>
                <div id="glyph-container" class="glyph-image"></div>
				<script type="module" nonce="${nonce}" src="${jsUri}"></script>
            </body>
            </html>
        `;
    }

    private showWebviewFirstView() {
        writeDebugLog(`Extension get ready message.`);
        if (!this.currentEditor) {
            writeDebugLog(`activeEditor is not found`);
            return;
        }
        // 初期表示をする。
        writeDebugLog(`Current editor is "${getTabName(this.currentEditor)}".`,);
        this.updatePreview(this.currentEditor, "onReady");
    }

    private tryReusePanel(): boolean {
        if (!this.panel) { return false; }

        this.panel.reveal(vscode.ViewColumn.Beside);

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) { return true; }
        // プレビュー中のドキュメントでアクティベートされた場合は更新しない。
        // (バージョンの更新は onDidChangeTextDocument で対応しているので考慮しなくてよいはず。)
        if (activeEditor.document.uri === this.currentUri) { return true; }
        this.updatePreview(activeEditor, "onReveal");
        return true;
    }

    private storeCurrentGlyphName(name: string) {
        this.currentGlyph = name;
    }

    private async fetchGlyphDataFromOtherFile(gid: number) {
        writeDebugLog(
            `fetchGlyphDataFromOtherFile is called for glyph (gid: ${gid}).`,
        );
        if (!this.panel) { throw new Error(`The panel is not open.`); }
        if (!this.currentUri) {
            writeDebugLog(`Not base file open`);
            throw new Error(`The glyph file is not open.`);
        }
        const glyphData = await getGlyphFileDataAsync(gid, getParentUri(this.currentUri));
        if (glyphData) {
            writeDebugLog(`Found: ${gid}`);
            return glyphData;
        } else {
            writeDebugLog(`Not found: ${gid}`);
            throw new Error(`The glyph data (gid: ${gid}) was not found.`);
        }
    }

    private updatePreview(editor: vscode.TextEditor, timing: string) {
        if (!this.panel) { return; }
        if (editor.document.languageId !== "sfd") { return; }

        this.currentEditor = editor;
        this.currentUri = editor.document.uri;
        this.currentVersion = editor.document.version;

        const fileName = getTabName(editor);
        const splineFontData = editor.document.getText().split("\n");
        postMessage(this.panel, "updateFontData", {
            fileName: fileName,
            fontData: splineFontData,
            startupGlyph: this.currentGlyph,
            timing: timing,
        });
    }

    private async onDidChangeTextDocument(
        event: vscode.TextDocumentChangeEvent,
    ) {
        if (!this.panel) { return; }
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) { return; }
        if (event.document.uri !== activeEditor.document.uri) { return; }
        this.updatePreview(activeEditor, "onDidChangeTextDocument");
    }

    private async onDidChangeActiveTextEditor(
        editor: vscode.TextEditor | undefined,
    ) {
        if (!this.panel) { return; }
        if (!editor) { return; }
        if (
            editor.document.uri === this.currentUri &&
            editor.document.version === this.currentVersion
        ) {
            return;
        }
        this.currentGlyph = undefined;
        this.updatePreview(editor, "onDidChangeActiveTextEditor");
    }
}
