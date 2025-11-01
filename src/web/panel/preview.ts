import * as vscode from "vscode";
import { writeDebugLog } from "./util";
import { PreviewPanel } from "./preview-panel";
import { findTargetDocument } from "./documents";

export class Preview {
    private panelMode = "single";
    private panels: PreviewPanel[] = [];

    public constructor() {
        const config = vscode.workspace.getConfiguration("fontforge-glyph-preview.preview");
        this.panelMode = config.get<string>("previewPanelMode", "single");
        writeDebugLog(`previewPanelMode is intialized as ${this.panelMode} mode.`);
    }

    public async open(context: vscode.ExtensionContext, uri: vscode.Uri | undefined, column?: vscode.ViewColumn) {
        writeDebugLog(`fontforge-glyph-preview.showPreview command is called: ${uri}`);

        // プレビューのパネルがアクティブなときにコマンド実行された場合は何もしない。
        if (!uri && this.panels.some(x => x.isActive)) { return; }

        const document = await findTargetDocument(uri);
        if (!document) { return; }
        
        if (this.panelMode === "single") {
            if (this.panels.length === 0) {
                this.panels.push(new PreviewPanel(context, this.panelMode));
            }
            const previewPanel = this.panels[0];
            // すでにパネルが存在する場合はそれを表示する。（2つ以上プレビューを表示しない）
            if (!await previewPanel.tryReusePanelAsync(document, column)) {
                // パネルがない場合は追加してセットアップをする。
                previewPanel.initialize(document, column ?? vscode.ViewColumn.Active);
            }

        } else /* multiple mode*/ {
            const existingPanel = this.panels.filter(x => x.shows(document))[0];
            if (existingPanel) {
                // すでにパネルが存在する場合はそれを表示する。（2つ以上プレビューを表示しない）
                existingPanel.reveal(column);
            } else {
                // パネルがない場合は追加してセットアップをする。
                const newPanel = new PreviewPanel(context, this.panelMode);
                newPanel.initialize(document, column ?? vscode.ViewColumn.Active);
                this.panels.push(newPanel);
            }
        }
    }

    public handleDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
        // previewPanelMode が途中で変わると動作に矛盾が出るため、パネルを閉じる。
        if (e.affectsConfiguration("fontforge-glyph-preview.preview.previewPanelMode")) {
            const config = vscode.workspace.getConfiguration("fontforge-glyph-preview.preview");
            const newPanelMode = config.get<string>("previewPanelMode", "single");
            
            if (this.panelMode !== newPanelMode) {
                writeDebugLog(`previewPanelMode is changed: ${this.panelMode} mode @ initialized -> ${newPanelMode} mode @ current.`);
                this.panelMode = newPanelMode;
                for (const panel of this.panels) {
                    panel.close();
                }
                this.panels.splice(0);
            }
        }
    }
}