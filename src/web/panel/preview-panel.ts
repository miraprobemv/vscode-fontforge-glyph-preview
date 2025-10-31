import * as vscode from "vscode";
import { generateNonce, getTabName, getFileBaseName, getParentUri, isUnderDirectory, writeDebugLog, sleep } from "./util";
import { getGlyphFileDataAsync, iterateGlyphFileDataAsync } from "./sfd";
import { postMessage, returnMessageAsync } from "./interop";

export class PreviewPanel {
    private context: vscode.ExtensionContext;

    // パネルを全体で1つしか表示しないため、情報を保持しておく。
    private panel: vscode.WebviewPanel | undefined;
    private currentEditor: vscode.TextEditor | undefined;
    private currentUri: vscode.Uri | undefined;
    private currentVersion: number | undefined;
    private currentGlyph: string | undefined;
    private isSfdir: boolean = false;
    private dirGlyphVersions: Map<vscode.Uri, number> = new Map<vscode.Uri, number>();

    // ファイルシステムの変更検知用ウォッチャー
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async activate() {
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
        if (await this.tryReusePanelAsync()) { return; }

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
                    await this.showWebviewFirstViewAsync();
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
            if (this.fileWatcher) {
                this.fileWatcher.dispose();
                this.fileWatcher = undefined;
            }
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
            vscode.Uri.joinPath(this.context.extensionUri, "dist", "web", "preview.js")
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

    private async showWebviewFirstViewAsync() {
        writeDebugLog(`Extension get ready message.`);
        if (!this.currentEditor) {
            writeDebugLog(`activeEditor is not found`);
            return;
        }
        // 初期表示をする。
        writeDebugLog(`Current editor is "${getTabName(this.currentEditor)}".`,);
        await this.updatePreviewAsync(this.currentEditor, "onReady");
    }

    private async tryReusePanelAsync(): Promise<boolean> {
        if (!this.panel) { return false; }

        this.panel.reveal(vscode.ViewColumn.Beside);

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) { return true; }
        // プレビュー中のドキュメントでアクティベートされた場合は更新しない。
        // (バージョンの更新は onDidChangeTextDocument で対応しているので考慮しなくてよいはず。)
        if (activeEditor.document.uri === this.currentUri) { return true; }
        await this.updatePreviewAsync(activeEditor, "onReveal");
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

    private async updatePreviewAsync(editor: vscode.TextEditor, timing: string) {
        if (!this.panel) { return; }
        if (editor.document.languageId !== "sfd") { return; }

        this.currentEditor = editor;
        this.currentUri = editor.document.uri;
        this.currentVersion = editor.document.version;
        this.isSfdir = (getFileBaseName(editor.document.fileName) === "font.props");
        this.dirGlyphVersions.clear();

        let fileName: string;
        let splineFontData: string[];
        if (this.isSfdir) {
            // SFD ディレクトリの場合は font.props と同じディレクトリの glyph ファイルを登録する。
            writeDebugLog(`Setup font.props: ${this.currentUri}`);
            const sfdir = getParentUri(this.currentUri);
            fileName = getFileBaseName(sfdir.path);
            splineFontData = [];
            for await (const {uri, version, glyphData} of iterateGlyphFileDataAsync(sfdir)) {
                this.dirGlyphVersions.set(uri, version);
                splineFontData.push(...glyphData);
            }

            // ファイルシステムの外部変更を監視。ここでは SFD ディレクトリ配下の .glyph ファイルのみを監視して対応する。
            if (this.fileWatcher) {
                this.fileWatcher.dispose();
            }
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(sfdir, "**/{font.props,*.glyph}") );
            this.fileWatcher.onDidChange(async (uri) => {
                if (!this.panel) { return; }
                if (!this.isSfdir) { return; }
                writeDebugLog(`Filesystem change detected: ${uri.fsPath}`);

                // 変更されたファイルが SFD ディレクトリ内にある場合、グリフ情報を更新してグリフを更新する。
                if (!isUnderDirectory(uri, sfdir)) { return; }
                await sleep(30); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
                if (getFileBaseName(uri.path) === "font.props") {
                    this.currentVersion = (await vscode.workspace.openTextDocument(uri)).version;
                } else {
                    const document = await vscode.workspace.openTextDocument(uri);
                    this.overrideGlyphData(document, "onFileSystemChange(.glyph)");
                }
            });

        } else {
            // 単独ファイルの場合はエディタからデータを抽出して更新
            writeDebugLog(`Setup .sfd or .glyph: ${this.currentUri}`);
            const parentDir = getParentUri(this.currentUri);
            fileName = getTabName(editor);
            splineFontData = editor.document.getText().split("\n");

            // ファイルシステムの外部変更を監視。該当ファイルをピンポイントに監視して対応する。
            if (this.fileWatcher) {
                this.fileWatcher.dispose();
            }
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(parentDir, fileName) );
            this.fileWatcher.onDidChange(async (uri) => {
                if (!this.panel) { return; }
                writeDebugLog(`Filesystem change detected: ${uri.fsPath}`);
                await sleep(30); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
                const document = await vscode.workspace.openTextDocument(uri);
                this.overrideGlyphData(document, "onFileSystemChange(.sfd or .glyph)");
            });
        }
        postMessage(this.panel, "updateFontData", {
            fileName: fileName,
            fontData: splineFontData,
            startupGlyph: this.currentGlyph,
            timing: timing,
        });
    }

    private overrideGlyphData(document: vscode.TextDocument, timing: string) {
        if (!this.panel) { return; }
        const glyphData = document.getText().split('\n');
        postMessage(this.panel, "overrideGlyphData", {
            glyphData: glyphData,
            timing: timing,
        });
    }

    private async onDidChangeTextDocument(
        event: vscode.TextDocumentChangeEvent,
    ) {
        if (!this.panel) { return; }
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) { return; }

        if (this.isSfdir) {
            // SFD ディレクトリを開いている場合
            // - font.props が更新された場合は何もしない # TODO: フォントの全体情報を利用する場合は情報を更新する。
            if (event.document.uri === activeEditor.document.uri) { return; }
            // - font.props の管理対象の glyph ファイルが更新された場合は該当のグリフ情報を置き換えて表示を更新する。
            if (!isUnderDirectory(event.document.uri, getParentUri(activeEditor.document.uri))) { return; }
            this.overrideGlyphData(event.document, "onDidChangeTextDocument(.glyph)");
        } else {
            // 単独ファイルを開いている場合は表示中のファイルが更新された場合のみ情報を更新する
            if (event.document.uri !== activeEditor.document.uri) { return; }
            await this.updatePreviewAsync(activeEditor, "onDidChangeTextDocument(.sfd or .glyph)");
        }
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
        await this.updatePreviewAsync(editor, "onDidChangeActiveTextEditor");
    }
}
