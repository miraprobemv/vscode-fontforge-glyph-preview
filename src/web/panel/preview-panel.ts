import * as vscode from "vscode";
import { generateNonce, getDocumentName, getFileBaseName, getParentUri, isUnderDirectory, writeDebugLog, sleep } from "./util";
import { getGlyphFileDataAsync, iterateGlyphFileDataAsync } from "./sfd";
import { postMessage, returnMessageAsync } from "./interop";
import { PreviewSettings } from "../common/types";
import { SfdDocument } from "./sfd-document";

export class PreviewPanel {
    private context: vscode.ExtensionContext;

    private panel: vscode.WebviewPanel | undefined;
    private panelMode: string;

    private settings: PreviewSettings;

    // 表示しているドキュメントの情報
    private document: SfdDocument | undefined;

    // 登録したイベント
    private eventSubscriptions: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, mode: string, document: vscode.TextDocument, column: vscode.ViewColumn) {
        this.context = context;
        this.panelMode = mode;
        this.document = new SfdDocument(
            document,
            (uri, timing) => this.onDidSingleFileChanged(uri, timing),
            (uri, timing) => this.onDidSfdirSubFileChanged(uri, timing),
        );
        this.settings = this.getPreviewSettings();
        writeDebugLog(`Preview panel is intialized as ${this.panelMode} mode. settings=${JSON.stringify(this.settings)}`);

        // パネルを追加してセットアップをする。
        this.panel = this.initializeWebviewPanel(column);
    }

    private getPreviewSettings(): PreviewSettings {
        const config = vscode.workspace.getConfiguration("fontforge-glyph-preview.preview");
        const settings = {
            ...this.settings,
            glyphSelectionMode: config.get<string>("setting.glyphSelectionMode", "table"),
            displayType: config.get<string>("default.view.displayType", "metrics"),
            showsAnchorPoints: config.get<boolean>("default.view.anchorPoints", false),
            showsCurvatureCombs: config.get<boolean>("default.view.curvatureCombs", false),
        };
        return settings;
    }

    public get isActive(): boolean {
        return (this.panel && this.panel.active) ?? false;
    }

    public get isDisposed(): boolean {
        return !this.panel;
    }

    public close(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.closeResources();
    }

    private closeResources(): void {
        if (this.document) {
            this.document.dispose();
            this.document = undefined;
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
                case "updateSettings":
                    writeDebugLog(`Update panel settings=${JSON.stringify(message.params)}.`);
                    this.settings = message.params;
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
        
        this.eventSubscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration("fontforge-glyph-preview.preview.setting")) { return; }
            const config = vscode.workspace.getConfiguration("fontforge-glyph-preview.preview");
            this.settings = {
                ...this.settings,
                glyphSelectionMode: config.get<string>("setting.glyphSelectionMode", "table"),
            };
            writeDebugLog(`Updated settings=${JSON.stringify(this.settings)}.`);
            if (!this.panel) { return; }
            postMessage(this.panel, "updateSettings", this.settings);
        }));

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
                <div id="root"></div>
				<script type="module" nonce="${nonce}" src="${jsUri}"></script>
            </body>
            </html>
        `;
    }

    private async showWebviewFirstViewAsync() {
        if (!this.panel) { return; }
        writeDebugLog(`Extension get ready message.`);
        if (!this.document) {
            writeDebugLog(`document is not found`);
            return;
        }
        postMessage(this.panel, "updateSettings", this.settings);
        // 初期表示をする。
        writeDebugLog(`Current editor is "${this.document.name}".`,);
        await this.updatePreviewAsync(this.document.document, "onReady");
    }

    public shows(document: vscode.TextDocument): boolean {
        return document.uri === this.document?.uri;
    }

    public tryReveal(column: vscode.ViewColumn | undefined): boolean {
        if (!this.panel) { return false; }
        this.panel.reveal(column, false);
        return true;
    }

    public async tryReusePanelAsync(document: vscode.TextDocument, column: vscode.ViewColumn | undefined): Promise<boolean> {
        if (!this.panel) { return false; }

        this.tryReveal(column);

        // プレビュー中のドキュメントでアクティベートされた場合は更新しない。
        // (バージョンの更新は onDidChangeTextDocument で対応しているので考慮しなくてよいはず。)
        if (document.uri === this.document?.uri) {
            return true;
        }
        await this.updatePreviewAsync(document, "onReveal");
        return true;
    }

    private storeCurrentGlyphName(name: string) {
        if (!this.document) { return; }
        this.document.currentGlyph = name;
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

        if (this.document) {
            this.document.update(document);
        } else {
            this.document = new SfdDocument(
                document,
                (uri, timing) => this.onDidSingleFileChanged(uri, timing),
                (uri, timing) => this.onDidSfdirSubFileChanged(uri, timing),
            );
        }
        this.panel.title = this.document.name;
        if (this.document.isSfdir) {
            // SFD ディレクトリの場合は時間がかかるのでローディングを表示する。
            postMessage(this.panel, "loading", {});
        } 
        
        postMessage(this.panel, "updateFontData", {
            fileName: this.document.name,
            fontData: await this.document.getDataAsync(),
            startupGlyph: this.document.currentGlyph,
            timing: timing,
        });
    }

    private overrideGlyphData(document: vscode.TextDocument, timing: string) {
        if (!this.panel) { return; }
        if (!this.document?.isSfdir) { return; }
        if (document.version === this.document.getSubdocumentVersion(document.uri)) { return; }
        this.document.updateSubdocumentVersion(document.uri, document.version);
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
        if (!this.document) { return; }

        if (this.document.isSfdir) {
            // SFD ディレクトリを開いている場合
            // - font.props が更新された場合は何もしない # TODO: フォントの全体情報を利用する場合は情報を更新する。
            if (event.document.uri === this.document.uri) { return; }
            // - font.props の管理対象の glyph ファイルが更新された場合は該当のグリフ情報を置き換えて表示を更新する。
            if (!isUnderDirectory(event.document.uri, getParentUri(this.document.uri))) { return; }
            this.overrideGlyphData(event.document, "onDidChangeTextDocument(.glyph)");
        } else {
            // 単独ファイルを開いている場合は表示中のファイルが更新された場合のみ情報を更新する
            if (event.document.uri !== this.document.uri) { return; }
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
        if (this.document) {
            this.document.currentGlyph = undefined;
        }
        await this.updatePreviewAsync(editor.document, "onDidChangeActiveTextEditor");
    }

    private async onDidSingleFileChanged(uri: vscode.Uri, timing: string) {
        if (!this.panel) { return; }
        // writeDebugLog(`Filesystem ${timing} detected: ${uri.fsPath}`);

        await this.waitFileFlush(); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
        const document = await vscode.workspace.openTextDocument(uri);
        await this.updatePreviewAsync(document, `onDidSingleFileChanged(${uri}, ${timing})`);

    }
    
    private async onDidSfdirSubFileChanged(uri: vscode.Uri, timing: string) {
        if (!this.panel) { return; }
        if (!this.document?.isSfdir) { return; }
        // writeDebugLog(`Filesystem ${timing} detected: ${uri.fsPath}`);

        await this.waitFileFlush(); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
        if (getFileBaseName(uri.path) === "font.props") {
            this.document.update(await vscode.workspace.openTextDocument(uri));
        } else {
            const document = await vscode.workspace.openTextDocument(uri);
            this.overrideGlyphData(document, `onDidSfdirSubFileChanged(${uri}, ${timing})`);
        }
    }

    private waitFileFlush() {
        return sleep(100); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
    }
}
