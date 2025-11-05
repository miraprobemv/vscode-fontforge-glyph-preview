import React, { useState, useCallback, useEffect } from "react";
import GlyphOutline from "../glyph/glyph-outline";
import GlyphList from "../ui/glyph-list";
import { useGlyphStore } from "../../hooks/glyph-store";
import { useVscodeApi } from "../../hooks/vscode-api";
import { GlyphData } from "../../libs/glyph";
import { postMessage, sendMessageAsync, writeDebugLog } from "../../libs/interop";
import { extractGid, extractGlyphName } from "../../libs/sfd";
import { usePreviewSettings } from "../../hooks/preview-settings";
import { Loading } from "../ui/loading";

export function PreviewApp() {
    const vscode = useVscodeApi();
    const glyphStore = useGlyphStore();
    const { previewSettings: settings, setPreviewSettings: setSettings } = usePreviewSettings();

    const [nameToGidList, setNameToGidList] = useState<[name: string, gid: number][]>([]);
    const [isGlyphSelectorOpen, setIsGlyphSelectorOpen] = useState(false);

    const [fileName, setFileName] = useState("");
    const [glyphName, setGlyphName] = useState("");

    const defaultGlyphData = { width: 0, paths: [], refers: [] };
    const [glyphData, setGlyphData] = useState<GlyphData>(defaultGlyphData);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

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
        setGlyphData((await glyphStore.getGlyphDataAsync(gid, getReferGlyphDataStringAsync)) ?? defaultGlyphData);
    };

    const getReferGlyphDataStringAsync = useCallback(async function (gid: number) {
        if (!glyphStore.has(gid)) {
            try {
                const glyphData: string[] = await sendMessageAsync(
                    vscode,
                    "fetchGlyphDataFromOtherFile",
                    { gid: gid }
                );
                const glyphName = glyphData[0].split(" ")[1];
                glyphStore.addGlyph(gid, glyphName, glyphData);
                return glyphData;
            } catch (error) {
                glyphStore.addGlyph(gid, undefined, undefined);
                return undefined;
            }
        }
        return glyphStore.getGlyphDataString(gid);
    }, [glyphStore]);

    // メッセージ受信
    const onMessage = useCallback(async (event: MessageEvent) => {
        switch (event.data.type) {
            case "updateFontData":
                {
                    const params = event.data.params;
                    writeDebugLog(vscode, "Received Font Data at " + params.timing + ".");

                    setFileName(params.fileName);

                    glyphStore.clear();
                    glyphStore.parseAllGlyphs(params.fontData);
                    writeDebugLog(vscode, "Update Glyph Store at " + params.timing + ".");

                    const glyphNameToGidList = glyphStore.getAllGlyphNameToGidList();
                    setNameToGidList(glyphNameToGidList);

                    setIsLoading(false);
                    if (params.startupGlyph) {
                        const name = params.startupGlyph;
                        const gid = glyphStore.getGlyphGid(name);
                        if (!gid) { return; }
                        await showGlyphDataAsync(name, gid);
                    } else if (glyphNameToGidList.length > 0) {
                        const [name, gid] = glyphNameToGidList[0];
                        await showGlyphDataAsync(name, gid);
                    }
                }
                break;
            case "overrideGlyphData":
                {
                    const params = event.data.params;
                    writeDebugLog(vscode, `Received Glyph Data at ${params.timing}. (showing ${glyphName})`);
                    const gid = extractGid(params.glyphData);
                    const name = extractGlyphName(params.glyphData);
                    glyphStore.addGlyph(gid, name, params.glyphData);

                    const glyphNameToGidList = glyphStore.getAllGlyphNameToGidList();
                    setNameToGidList(glyphNameToGidList);
                    if (name === glyphName) {
                        writeDebugLog(vscode, "Updete overrided glyph: " + name);
                        await showGlyphDataAsync(name, gid);
                    }
                }
                break;
            case "updateSettings":
                {
                    writeDebugLog(vscode, `Recieve updateSettings settings=${JSON.stringify(event.data.param)}.`);
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
    }, [glyphName, glyphStore, getReferGlyphDataStringAsync]);

    useEffect(() => {
        const onMessageCallback = onMessage;
        window.addEventListener("message", onMessageCallback);
        // ready を通知（既存コードと同様）
        if (!isReady) {
            writeDebugLog(vscode, "Event Listener Registered.");
            postMessage(vscode, "ready");
            setIsReady(true);
        } else {
            writeDebugLog(vscode, "Event Listener Updated.");
        }
        return () => {
            window.removeEventListener("message", onMessageCallback);
            writeDebugLog(vscode, "Event Listener Removed.");
        };
    }, [onMessage]);

    return (
        <div className="preview-body">
            <header className="header">
                <div className="file-name-container"><span>{fileName}</span></div>
                <div className="menu-container">
                    <div className="glyph-name-container">
                        <button type="button" className="open-side-menu-button" disabled={nameToGidList.length <= 1} onClick={_ => handleToggleGlyphSelectorOpen()}>&gt;</button>
                        <span className="glyph-name-title">Glyph Name: </span><span className="glyph-name">{glyphName}</span>
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
            <GlyphList nameToGidList={nameToGidList} open={isGlyphSelectorOpen} onClose={handleGlyphSelectorClose} onItemSelected={handleGlyphSelected} />
            <GlyphOutline glyphData={glyphData} settings={settings}></GlyphOutline>
            {isLoading && <Loading />}
        </div>
    );
}
