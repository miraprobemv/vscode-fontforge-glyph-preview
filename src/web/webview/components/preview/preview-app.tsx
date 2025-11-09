import React, { useState, useEffect, useEffectEvent } from "react";
import GlyphOutline from "../glyph/glyph-outline";
import GlyphList from "../ui/glyph-list";
import { GlyphStoreProvider } from "../../hooks/glyph-store";
import { useVscodeApi } from "../../hooks/vscode-api";
import { GlyphData } from "../../libs/glyph";
import { postMessage, sendMessageAsync, writeDebugLog } from "../../libs/interop";
import { extractEncoding, extractGlyphName, GlyphEncoding } from "../../libs/sfd";
import { usePreviewSettings } from "../../hooks/preview-settings";
import { Loading } from "../ui/loading";
import GLyphTable from "../ui/glyph-table";
import { GlyphStore } from "../../libs/glyph-store";

export function PreviewApp() {
    const vscode = useVscodeApi();
    const { previewSettings: settings, setPreviewSettings: setSettings } = usePreviewSettings();

    const glyphStoreRef = React.useRef<GlyphStore | null>(null);
    if (!glyphStoreRef.current) {
        const getAdditionalGlyphDataStringAsync = async function (gid: number): Promise<string[]> {
            const glyphData: string[] = await sendMessageAsync(
                vscode,
                "fetchGlyphDataFromOtherFile",
                { gid: gid }
            );
            return glyphData;
        };
        glyphStoreRef.current = new GlyphStore(getAdditionalGlyphDataStringAsync);
    }
    const glyphStore = glyphStoreRef.current;

    const [nameToEncodingList, setNameToEncodingList] = useState<[name: string, encoding: GlyphEncoding][]>([]);
    const [isGlyphSelectorOpen, setIsGlyphSelectorOpen] = useState(false);

    const [fileName, setFileName] = useState("");
    const [glyphName, setGlyphName] = useState("");

    const defaultGlyphData = { width: 0, paths: [], refers: [] };
    const [glyphData, setGlyphData] = useState<GlyphData>(defaultGlyphData);
    
    const [isLoading, setIsLoading] = useState(false);

    const handleDisplayTypeChanged = (type: string) => {
        setSettings(state => {
            const newState = {
                ...state,
                displayType: type,
            }
            postMessage(vscode, "updateSettings", newState);
            return newState;
        })
    };

    const handleShowCurvatureCombsChanged = (shows: boolean) => {
        setSettings(state => {
            const newState = {
                ...state,
                showsCurvatureCombs: shows,
            }
            postMessage(vscode, "updateSettings", newState);
            return newState;
        })
    };

    const handleToggleGlyphSelectorOpen = () => {
        setIsGlyphSelectorOpen(state => !state);
    };

    const handleGlyphSelectorClose = () => {
        setIsGlyphSelectorOpen(false);
    };

    const handleGlyphSelected = async (name: string, gid: number) => {
        showGlyphDataAsync(name, gid);
        postMessage(vscode, "storeCurrentGlyphName", { name });
    };

    const showGlyphDataAsync = async (name: string, gid: number) => {
        setGlyphName(name);
        setGlyphData((await glyphStore.getGlyphDataAsync(gid)) ?? defaultGlyphData);
    };

    // メッセージ受信
    const onMessage = useEffectEvent(async (event: MessageEvent) => {
        switch (event.data.type) {
            case "updateFontData":
                {
                    const params = event.data.params;
                    writeDebugLog(vscode, "Received Font Data at " + params.timing + ".");

                    setFileName(params.fileName);

                    glyphStore.clear();
                    glyphStore.parseAllGlyphs(params.fontData);
                    writeDebugLog(vscode, "Update Glyph Store at " + params.timing + ".");

                    const glyphNameToEncodingList = glyphStore.getAllGlyphNameToEncodingList();
                    setNameToEncodingList(glyphNameToEncodingList);

                    setIsLoading(false);
                    if (params.startupGlyph) {
                        const name = params.startupGlyph;
                        const gid = glyphStore.getGlyphGid(name);
                        if (!gid) { return; }
                        await showGlyphDataAsync(name, gid);
                    } else if (glyphNameToEncodingList.length > 0) {
                        if (settings.glyphSelectionMode === "table") {
                            setIsGlyphSelectorOpen(true);
                        }
                        const [name, {gid}] = glyphNameToEncodingList[0];
                        await showGlyphDataAsync(name, gid);
                    }
                }
                break;
            case "overrideGlyphData":
                {
                    const params = event.data.params;
                    writeDebugLog(vscode, `Received Glyph Data at ${params.timing}. (showing ${glyphName})`);
                    const name = extractGlyphName(params.glyphData);
                    const glyphEncoding = extractEncoding(params.glyphData);
                    glyphStore.addGlyph(glyphEncoding.gid, name, glyphEncoding, params.glyphData);

                    const glyphNameToEncodingList = glyphStore.getAllGlyphNameToEncodingList();
                    setNameToEncodingList(glyphNameToEncodingList);
                    if (name === glyphName) {
                        writeDebugLog(vscode, "Updete overrided glyph: " + name);
                        await showGlyphDataAsync(name, glyphEncoding.gid);
                    }
                }
                break;
            case "updateSettings":
                {
                    writeDebugLog(vscode, `Recieve updateSettings settings=${JSON.stringify(event.data.params)}.`);
                    setSettings(event.data.params);
                }
                break;
            case "loading":
                {
                    writeDebugLog(vscode, "Patient...");
                    setIsLoading(true);
                }
                break;
        }
    });

    useEffect(() => {
        const eventHandler = (event: MessageEvent<any>) => onMessage(event);
        window.addEventListener("message", eventHandler);
        writeDebugLog(vscode, "Event listener was registered.");
        postMessage(vscode, "ready");
        return () => {
            window.removeEventListener("message", eventHandler);
            writeDebugLog(vscode, "Event listener was removed.");
            try {
                glyphStoreRef.current?.dispose();
            } finally {
                glyphStoreRef.current = null;
            }
        };
    }, []);

    const hasMultipleGlyphs = nameToEncodingList.length >= 2;

    return (
        <GlyphStoreProvider glyphStore={glyphStore}>
            <div className="preview-body">
                <header className="header">
                    <div className="menu-container">
                        <div className="glyph-name-container">
                            <span className="file-name">{fileName}</span><span> &gt; </span>
                            <span
                                className={`glyph-name${(hasMultipleGlyphs) ? " _has-multiple-glyphs" : " _has-single-glyph"}${(isGlyphSelectorOpen) ? " _is-selecting" : ""}`}
                                onClick={_ => hasMultipleGlyphs && handleToggleGlyphSelectorOpen()}
                            >{glyphName}</span>
                        </div>
                        <div className="sub-menu-container">
                            <span className="menu-item"><label>View</label>
                                <aside className="menu-dropdown">
                                    <ul>
                                        <li>
                                            <label><input type="radio" name="displayType" value="metrics" checked={settings.displayType === "metrics"} onChange={e => handleDisplayTypeChanged(e.target.value)}/>Metrics</label>
                                            <ul>
                                                <li>
                                                    <label><input type="checkbox" checked={settings.showsCurvatureCombs} onChange={e => handleShowCurvatureCombsChanged(e.target.checked)} disabled={settings.displayType !== "metrics"} />Curvature combs</label>
                                                </li>
                                            </ul>
                                        </li>
                                        <li>
                                            <label><input type="radio" name="displayType" value="preview" checked={settings.displayType === "preview"} onChange={e => handleDisplayTypeChanged(e.target.value)}/>Preview</label>
                                        </li>
                                    </ul>
                                </aside>
                            </span>
                        </div>
                    </div>
                </header>
                {(settings.glyphSelectionMode === "table" && hasMultipleGlyphs && isGlyphSelectorOpen) && <GLyphTable nameToEncodingList={nameToEncodingList} displayType={settings.displayType} onClose={handleGlyphSelectorClose} onItemSelected={handleGlyphSelected} />}
                {(settings.glyphSelectionMode === "list" && hasMultipleGlyphs && isGlyphSelectorOpen) && <GlyphList nameToEncodingList={nameToEncodingList} onClose={handleGlyphSelectorClose} onItemSelected={handleGlyphSelected} />}
                <GlyphOutline glyphData={glyphData} settings={settings}></GlyphOutline>
                {isLoading && <Loading />}
            </div>
        </GlyphStoreProvider>
    );
}
