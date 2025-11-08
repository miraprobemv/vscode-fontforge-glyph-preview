import * as vscode from "vscode";
import { generateNonce, getFileBaseName, getParentUri, sleep, writeDebugLog } from "./util";
import { mapTuple, zip } from "../common/util";
import { getGlyphFileDataAsync } from "./sfd";
import { postMessage, returnMessageAsync } from "./interop";
import { SfdDocument } from "./sfd-document";

export class ComparePanel {
    private context: vscode.ExtensionContext;

    private panel: vscode.WebviewPanel;

    // 表示しているドキュメントの情報
    private sfdDocuments: [SfdDocument, SfdDocument];

    // 登録したイベント
    private eventSubscriptions: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, documents: [vscode.TextDocument, vscode.TextDocument]) {
        this.context = context;
        this.sfdDocuments = mapTuple(documents, (doc, idx) => {
            return new SfdDocument(
                doc,
                (uri, timing) => this.onDidSingleFileChanged(idx, uri, timing),
                (uri, timing) => this.onDidSfdirSubFileChanged(idx, uri, timing),
            );
        });
        this.panel = this.initializeWebviewPanel();
    }

    private initializeWebviewPanel(): vscode.WebviewPanel {
        const fileName0 = getFileBaseName(this.sfdDocuments[0].name);
        const fileName1 = getFileBaseName(this.sfdDocuments[1].name);
        const panel = vscode.window.createWebviewPanel(
            "fontforgeGlyphPreviewCompare",
            `${fileName0} ↔ ${fileName1}`,
            vscode.ViewColumn.Active,
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
                    this.storeCurrentGlyphName(message.params.names);
                    break;
                case "fetchGlyphDataFromOtherFile":
                    // 追加のグリフ情報を取得する。
                    await returnMessageAsync(
                        this.panel,
                        message,
                        async (params) => await this.fetchGlyphDataFromOtherFile(params.target, params.gid),
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

        // WebView のコンテンツを設定する。
        panel.webview.html = this.initializeHtmlContent(panel);

        panel.onDidDispose(() => {
            this.panel = undefined!;
            this.closeResources();
        });

        return panel;
    }

    private closeResources(): void {
        
        for (const document of this.sfdDocuments) {
            document.dispose();
        }
        this.sfdDocuments = [undefined!, undefined!];
        for (const subscription of this.eventSubscriptions) {
            subscription.dispose();
        }
        this.eventSubscriptions.splice(0);
    }

    private initializeHtmlContent(panel: vscode.WebviewPanel): string {
        const nonce = generateNonce();
        const cspSource = panel.webview.cspSource;
        const cssUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css")
        );
        const jsUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "dist", "web", "compare.js")
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
            <body class="compare-body">
                <div id="root"></div>
				<script type="module" nonce="${nonce}" src="${jsUri}"></script>
            </body>
            </html>
        `;
    }

    private async showWebviewFirstView() {
        writeDebugLog(`Compare extension get ready message.`);
        // 初期表示をする。
        writeDebugLog(`"${getFileBaseName(this.sfdDocuments[0].name)}" VS "${getFileBaseName(this.sfdDocuments[0].name)}"`,);
        await this.updatePreviewAsync(mapTuple(this.sfdDocuments, x => x.document), "onReady");
    }


    private storeCurrentGlyphName(names: [string, string]) {
        zip(this.sfdDocuments, names).forEach(([document, name]) => {
            document.currentGlyph = name;
        });
    }

    private async fetchGlyphDataFromOtherFile(target: number, gid: number) {
        writeDebugLog(
            `fetchGlyphDataFromOtherFile is called for glyph (target: ${target}, gid: ${gid}).`,
        );
        const glyphData = await getGlyphFileDataAsync(gid, getParentUri(this.sfdDocuments[target].uri));
        if (glyphData) {
            writeDebugLog(`Found: target: ${target}, gid: ${gid}`);
            return glyphData;
        } else {
            writeDebugLog(`Not found: target: ${target}, gid: ${gid}`);
            throw new Error(`The glyph data (target: ${target}, gid: ${gid}) was not found.`);
        }
    }

    private async updatePreviewAsync(documents: [vscode.TextDocument, vscode.TextDocument], timing: string) {

        if (documents.some(x => x.languageId !== "sfd"))  { return; }

        for (const [sfdDocument, document] of zip(this.sfdDocuments, documents)) {
            sfdDocument.update(document);
        }
        if (this.sfdDocuments.some(x => x.isSfdir)) {
            // SFD ディレクトリの場合は時間がかかるのでローディングを表示する。
            postMessage(this.panel, "loading", {});
        }
        postMessage(this.panel, "updateFontData", {
            dataList: await Promise.all(this.sfdDocuments.map(async (doc)=>{
                return {
                    fileName: doc.name,
                    fontData: await doc.getDataAsync(),
                    startupGlyph: doc.currentGlyph,
                };
            })),
            timing: timing,
        });
    }

    private async onDidChangeTextDocument(
        event: vscode.TextDocumentChangeEvent,
    ) {
        // const activeEditor = vscode.window.activeTextEditor;
        // if (!activeEditor) { return; }
        // if (event.document.uri !== activeEditor.document.uri) { return; }
        // this.updatePreview(activeEditor, "onDidChangeTextDocument");
    }

    
    private async onDidSingleFileChanged(target: number, uri: vscode.Uri, timing: string) {
        // if (!this.panel) { return; }
        // // writeDebugLog(`Filesystem ${timing} detected: ${uri.fsPath}`);

        // await this.waitFileFlush(); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
        // const document = await vscode.workspace.openTextDocument(uri);
        // await this.updatePreviewAsync(document, `onDidSingleFileChanged(${uri}, ${timing})`);

    }
    
    private async onDidSfdirSubFileChanged(target: number, uri: vscode.Uri, timing: string) {
        // if (!this.panel) { return; }
        // if (!this.isSfdir) { return; }
        // // writeDebugLog(`Filesystem ${timing} detected: ${uri.fsPath}`);

        // await this.waitFileFlush(); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
        // if (getFileBaseName(uri.path) === "font.props") {
        //     this.document = await vscode.workspace.openTextDocument(uri);
        // } else {
        //     const document = await vscode.workspace.openTextDocument(uri);
        //     this.overrideGlyphData(document, `onDidSfdirSubFileChanged(${uri}, ${timing})`);
        // }
    }

    private waitFileFlush() {
        return sleep(100); // ファイルのフラッシュが追い付いていないみたいなのでややまつ。
    }
}
