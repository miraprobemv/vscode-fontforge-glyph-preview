import * as vscode from "vscode";
import { iterateGlyphFileDataAsync } from "./sfd";
import { getParentUri, getFileBaseName, getDocumentName, writeDebugLog } from "./util";


export class SfdDocument {
    // 表示しているドキュメントの関連情報
    private _document!: vscode.TextDocument;
    private _isSfdir: boolean = false;
    private _dirGlyphVersions: Map<vscode.Uri, number> = new Map<vscode.Uri, number>();
    private _onDidSingleFileChanged: (uri: vscode.Uri, timing: string) => void;
    private _onDidSfdirSubFileChanged: (uri: vscode.Uri, timing: string) => void;
    public currentGlyph: string | undefined;

    // ファイルシステムの変更検知用ウォッチャー
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    public constructor(
        document: vscode.TextDocument,
        onDidSingleFileChanged: (uri: vscode.Uri, timing: string) => void,
        onDidSfdirSubFileChanged: (uri: vscode.Uri, timing: string) => void
    ) {
        this.update(document);
        this._onDidSingleFileChanged = onDidSingleFileChanged;
        this._onDidSfdirSubFileChanged = onDidSfdirSubFileChanged;
    }

    public get document(): vscode.TextDocument {
        return this._document;
    }

    public get uri(): vscode.Uri {
        return this._document.uri;
    }

    public get version(): number {
        return this._document.version;
    }

    public get languageId(): string {
        return this._document.languageId;
    }


    public get isSfdir(): boolean {
        return this._isSfdir;
    }

    public get name(): string {
        if (this._isSfdir) {
            const sfdir = getParentUri(this._document.uri);
            return getFileBaseName(sfdir.path);
        } else {
            return getDocumentName(this._document);
        }
    }

    public getSubdocumentVersion(uri: vscode.Uri): number | undefined {
        return this._dirGlyphVersions.get(uri);
    }

    public updateSubdocumentVersion(uri: vscode.Uri, version: number): void {
        this._dirGlyphVersions.set(uri, version);
    }

    public update(document: vscode.TextDocument): void {

        this._document = document;
        this._isSfdir = (getFileBaseName(document.fileName) === "font.props");
        this._dirGlyphVersions.clear();

        let fileName: string;
        if (this._isSfdir) {
            const sfdir = getParentUri(this._document.uri);
            fileName = getFileBaseName(sfdir.path);

            // ファイルシステムの外部変更を監視。ここでは SFD ディレクトリ配下の .glyph ファイルのみを監視して対応する。
            if (this.fileWatcher) {
                this.fileWatcher.dispose();
            }
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(sfdir, "{font.props,*.glyph}"));
            this.fileWatcher.onDidCreate((uri) => this._onDidSfdirSubFileChanged(uri, "create"));
            this.fileWatcher.onDidChange((uri) => this._onDidSfdirSubFileChanged(uri, "change"));

        } else {
            const parentDir = getParentUri(this._document.uri);
            fileName = getDocumentName(this._document);

            // ファイルシステムの外部変更を監視。該当ファイルをピンポイントに監視して対応する。
            if (this.fileWatcher) {
                this.fileWatcher.dispose();
            }
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(parentDir, fileName));
            this.fileWatcher.onDidCreate((uri) => this._onDidSingleFileChanged(uri, "create"));
            this.fileWatcher.onDidChange((uri) => this._onDidSingleFileChanged(uri, "change"));
        }
    }

    public async getDataAsync(): Promise<string[]> {
        let splineFontData: string[];
        if (this._isSfdir) {
            // SFD ディレクトリの場合は font.props と同じディレクトリの glyph ファイルを登録する。
            writeDebugLog(`Setup font.props: ${this._document.uri}`);
            const sfdir = getParentUri(this._document.uri);
            splineFontData = [];
            for await (const { uri, version, glyphData } of iterateGlyphFileDataAsync(sfdir)) {
                this._dirGlyphVersions.set(uri, version);
                splineFontData.push(...glyphData);
            }

        } else {
            // 単独ファイルの場合はエディタからデータを抽出して更新
            writeDebugLog(`Setup .sfd or .glyph: ${this._document.uri}`);
            splineFontData = this._document.getText().split("\n");

        }
        return splineFontData;
    }

    public dispose() {
        this._document = undefined!;
        this._onDidSfdirSubFileChanged = undefined!;
        this._onDidSingleFileChanged = undefined!;
        this._dirGlyphVersions.clear();
        this._dirGlyphVersions = undefined!;
    }
}
