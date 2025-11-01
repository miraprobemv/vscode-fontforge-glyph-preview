import * as vscode from "vscode";
import { generateNonce, getDocumentName, getFileBaseName, getParentUri, isUnderDirectory, writeDebugLog, sleep } from "./util";
import { getGlyphFileDataAsync, iterateGlyphFileDataAsync } from "./sfd";
import { postMessage, returnMessageAsync } from "./interop";

export class PreviewPanel {
    private context: vscode.ExtensionContext;

    private panel: vscode.WebviewPanel | undefined;

    private panelMode: string;

    private document: vscode.TextDocument | undefined;
    // 表示しているドキュメントの関連情報
    private isSfdir: boolean = false;
    private dirGlyphVersions: Map<vscode.Uri, number> = new Map<vscode.Uri, number>();
    private currentGlyph: string | undefined;

    // ファイルシステムの変更検知用ウォッチャー
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    // 登録したイベント
    private eventSubscriptions: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, mode: string) {
        this.context = context;
        this.panelMode = mode;
        writeDebugLog(`Preview panel is intialized as ${this.panelMode} mode.`);
    }

    public get isActive(): boolean {
        return (this.panel && this.panel.active) ?? false;
    }

    public get uri(): vscode.Uri | undefined {
        return this.document?.uri;
    }

    public initialize(document: vscode.TextDocument, column: vscode.ViewColumn) {

        this.document = document;
        // パネルを追加してセットアップをする。
        this.panel = this.initializeWebviewPanel(column);
    }

    public close(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.closeResources();
    }

    private closeResources(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        for (const subscription of this.eventSubscriptions) {
            subscription.dispose();
        }
        this.eventSubscriptions.splice(0);
    }

    private initializeWebviewPanel(column: vscode.ViewColumn): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            "fontforgeGlyphPreview",
            "FontForge Glyph Preview",
            { viewColumn: column, preserveFocus: false },
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
        this.eventSubscriptions.push(vscode.workspace.onDidChangeTextDocument((event) =>
            this.onDidChangeTextDocument(event)
        ));

        // 別のドキュメントに切り替わった時にプレビューを更新する。（single mode の場合のみ）
        // プレビュー対象外のドキュメントから現在プレビュー中のドキュメントに戻ってきた場合、更新がなければプレビューを更新しない。
        if (this.panelMode === "single") {
            this.eventSubscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) =>
                this.onDidChangeActiveTextEditor(editor)
            ));
        }

        // WebView のコンテンツを設定する。
        panel.webview.html = this.initializeHtmlContent(panel);

        panel.onDidDispose(() => {
            this.panel = undefined;
            this.closeResources();
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
        if (!this.document) {
            writeDebugLog(`document is not found`);
            return;
        }
        // 初期表示をする。
        writeDebugLog(`Current editor is "${getDocumentName(this.document)}".`,);
        await this.updatePreviewAsync(this.document, "onReady");
    }

    public shows(document: vscode.TextDocument): boolean {
        return document.uri === this.document?.uri;
    }

    public reveal(column: vscode.ViewColumn | undefined) {
        if (!this.panel) { return; }
        this.panel.reveal(column, false);
    }

    public async tryReusePanelAsync(document: vscode.TextDocument, column: vscode.ViewColumn | undefined): Promise<boolean> {
        if (!this.panel) { return false; }

        this.reveal(column);

        // プレビュー中のドキュメントでアクティベートされた場合は更新しない。
        // (バージョンの更新は onDidChangeTextDocument で対応しているので考慮しなくてよいはず。)
        if (document.uri === this.document?.uri) {
            return true;
        }
        await this.updatePreviewAsync(document, "onReveal");
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
        if (!this.document) {
            writeDebugLog(`Not base file open`);
            throw new Error(`The glyph file is not open.`);
        }
        const glyphData = await getGlyphFileDataAsync(gid, getParentUri(this.document.uri));
        if (glyphData) {
            writeDebugLog(`Found: ${gid}`);
            return glyphData;
        } else {
            writeDebugLog(`Not found: ${gid}`);
            throw new Error(`The glyph data (gid: ${gid}) was not found.`);
        }
    }

    private async updatePreviewAsync(document: vscode.TextDocument, timing: string) {
        if (!this.panel) { return; }
        if (document.languageId !== "sfd") { return; }

        this.document = document;
        this.isSfdir = (getFileBaseName(document.fileName) === "font.props");
        this.dirGlyphVersions.clear();

        let fileName: string;
        let splineFontData: string[];
        if (this.isSfdir) {
            // SFD ディレクトリの場合は font.props と同じディレクトリの glyph ファイルを登録する。
            writeDebugLog(`Setup font.props: ${this.document.uri}`);
            const sfdir = getParentUri(this.document.uri);
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
                    this.document = await vscode.workspace.openTextDocument(uri);
                } else {
                    const document = await vscode.workspace.openTextDocument(uri);
                    this.overrideGlyphData(document, "onFileSystemChange(.glyph)");
                }
            });

        } else {
            // 単独ファイルの場合はエディタからデータを抽出して更新
            writeDebugLog(`Setup .sfd or .glyph: ${this.document.uri}`);
            const parentDir = getParentUri(this.document.uri);
            fileName = getDocumentName(document);
            splineFontData = document.getText().split("\n");

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

        if (this.isSfdir && this.document) {
            // SFD ディレクトリを開いている場合
            // - font.props が更新された場合は何もしない # TODO: フォントの全体情報を利用する場合は情報を更新する。
            if (event.document.uri === activeEditor.document.uri) { return; }
            // - font.props の管理対象の glyph ファイルが更新された場合は該当のグリフ情報を置き換えて表示を更新する。
            if (!isUnderDirectory(event.document.uri, getParentUri(this.document.uri))) { return; }
            this.overrideGlyphData(event.document, "onDidChangeTextDocument(.glyph)");
        } else {
            // 単独ファイルを開いている場合は表示中のファイルが更新された場合のみ情報を更新する
            if (event.document.uri !== activeEditor.document.uri) { return; }
            await this.updatePreviewAsync(event.document, "onDidChangeTextDocument(.sfd or .glyph)");
        }
    }

    private async onDidChangeActiveTextEditor(
        editor: vscode.TextEditor | undefined,
    ) {
        if (!this.panel) { return; }
        if (!editor) { return; }
        if (
            editor.document.uri === this.document?.uri &&
            editor.document.version === this.document?.version
        ) {
            return;
        }
        this.currentGlyph = undefined;
        await this.updatePreviewAsync(editor.document, "onDidChangeActiveTextEditor");
    }
}
