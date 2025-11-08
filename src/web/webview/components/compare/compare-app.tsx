import React, { useState, useCallback, useEffect, useEffectEvent } from "react";
import GlyphOutline from "../glyph/glyph-outline";
import GlyphNameList from "../ui/glyph-name-list";
import { useGlyphStores } from "../../hooks/compare-glyph-store";
import { useVscodeApi } from "../../hooks/vscode-api";
import { GlyphData } from "../../libs/glyph";
import { postMessage, sendMessageAsync, writeDebugLog } from "../../libs/interop";
import { extractGid, extractGlyphName } from "../../libs/sfd";
import { usePreviewSettings } from "../../hooks/preview-settings";
import { Loading } from "../ui/loading";
import GlyphOnionSkin from "../glyph/glyph-onion-skin";

export function CompareApp() {
    const vscode = useVscodeApi();
    const glyphStores = useGlyphStores();
    const { previewSettings: settings, setPreviewSettings: setSettings } = usePreviewSettings();

    const [sharedNameList, setSharedNameList] = useState<string[]>([]);
    const [isGlyphSelectorOpen, setIsGlyphSelectorOpen] = useState(false);

    const [fileName, setFileName] = useState("");
    const [glyphName, setGlyphName] = useState("");

    const defaultGlyphData = { width: 0, paths: [], refers: [] };
    const [glyphData, setGlyphData] = useState<[GlyphData, GlyphData]>([defaultGlyphData, defaultGlyphData]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // const handleDisplayTypeChanged = (type: string) => {
    //     setSettings(state => {
    //         const newState = {
    //             ...state,
    //             displayType: type,
    //         }
    //         postMessage(vscode, "updateSettings", newState);
    //         return newState;
    //     })
    // };

    // const handleShowCurvatureCombsChanged = (shows: boolean) => {
    //     setSettings(state => {
    //         const newState = {
    //             ...state,
    //             showsCurvatureCombs: shows,
    //         }
    //         postMessage(vscode, "updateSettings", newState);
    //         return newState;
    //     })
    // };

    const handleToggleGlyphSelectorOpen = () => {
        setIsGlyphSelectorOpen(state => !state);
    };

    const handleGlyphSelectorClose = () => {
        setIsGlyphSelectorOpen(false);
    };

    const handleGlyphSelected = async (name: string) => {
        for (let target = 0; target < 2; target++) {
            const gid = glyphStores[target].getGlyphGid(name);
            if (!gid) return;
            showGlyphDataAsync(target, name, gid);
        }
        postMessage(vscode, "storeCurrentGlyphName", { names: [name, name] });
    };

    const showGlyphDataAsync = async (target: number, name: string, gid: number) => {
        setGlyphName(name);
        
        const newGlyphData = (await glyphStores[target].getGlyphDataAsync(gid, getReferGlyphDataStringAsync(target))) ?? defaultGlyphData;
        setGlyphData(state => {
            const newState: [GlyphData, GlyphData] = [...state];
            newState[target] = newGlyphData;
            return newState;
        });
    };

    const getReferGlyphDataStringAsync = (target: number) => {
        return async function (gid: number) {
            if (!glyphStores[target].has(gid)) {
                try {
                    const glyphData: string[] = await sendMessageAsync(
                        vscode,
                        "fetchGlyphDataFromOtherFile",
                        { gid: gid }
                    );
                    const glyphName = glyphData[0].split(" ")[1];
                    glyphStores[target].addGlyph(gid, glyphName, glyphData);
                    return glyphData;
                } catch (error) {
                    glyphStores[target].addGlyph(gid, undefined, undefined);
                    return undefined;
                }
            }
            return glyphStores[target].getGlyphDataString(gid);
        }
    };

    // メッセージ受信
    const onMessage = useEffectEvent(async (event: MessageEvent) => {
        switch (event.data.type) {
            case "updateFontData":
                {
                    const params = event.data.params;
                    writeDebugLog(vscode, "Received Font Data at " + params.timing + ".");

                    setFileName(params.dataList[0].fileName);

                    for (let i = 0; i < 2; i++) {
                        glyphStores[i].clear();
                        glyphStores[i].parseAllGlyphs(params.dataList[i].fontData);
                    }
                    writeDebugLog(vscode, "Update Glyph Store at " + params.timing + ".");

                    const glyphNameToGidList0 = glyphStores[0].getAllGlyphNameToGidList();
                    const glyphNameToGidList1 = glyphStores[1].getAllGlyphNameToGidList();
                    const nameSet = new Set(glyphNameToGidList1.map(x => x[0]));
                    const sharedGlyphNameList = glyphNameToGidList0.filter(x => nameSet.has(x[0])).map(x => x[0]);
                    setSharedNameList(sharedGlyphNameList);

                    setIsLoading(false);
                    if (params.dataList[0].startupGlyph) {
                        const name = params.startupGlyph;
                        for (let i = 0; i < 2; i++) {
                            const gid = glyphStores[i].getGlyphGid(name);
                            if (!gid) { return; }
                            await showGlyphDataAsync(i, name, gid);
                        }
                    } else if (sharedGlyphNameList.length > 0) {
                        const name = sharedGlyphNameList[0];
                        for (let i = 0; i < 2; i++) {
                            const gid = glyphStores[i].getGlyphGid(name);
                            if (!gid) { return; }
                            await showGlyphDataAsync(i, name, gid);
                        }
                    }
                }
                break;
            case "overrideGlyphData":
                // {
                //     const params = event.data.params;
                //     writeDebugLog(vscode, `Received Glyph Data at ${params.timing}. (showing ${glyphName})`);
                //     const gid = extractGid(params.glyphData);
                //     const name = extractGlyphName(params.glyphData);
                //     glyphStore.addGlyph(gid, name, params.glyphData);

                //     const glyphNameToGidList = glyphStore.getAllGlyphNameToGidList();
                //     setNameToGidList(glyphNameToGidList);
                //     if (name === glyphName) {
                //         writeDebugLog(vscode, "Updete overrided glyph: " + name);
                //         await showGlyphDataAsync(name, gid);
                //     }
                // }
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
    });

    useEffect(() => {
        const eventHandler = (event: MessageEvent<any>) => onMessage(event);
        window.addEventListener("message", eventHandler);
        writeDebugLog(vscode, "Event listener was registered.");
        postMessage(vscode, "ready");
        return () => {
            window.removeEventListener("message", eventHandler);
            writeDebugLog(vscode, "Event listener was removed.");
        };
    }, []);

    return (
        <div className="preview-body">
            <header className="header">
                <div className="file-name-container"><span>{fileName}</span></div>
                <div className="menu-container">
                    <div className="glyph-name-container">
                        <button type="button" className="open-side-menu-button" disabled={sharedNameList.length <= 1} onClick={_ => handleToggleGlyphSelectorOpen()}>&gt;</button>
                        <span className="glyph-name-title">Glyph Name: </span><span className="glyph-name">{glyphName}</span>
                    </div>
                    {/* <div className="sub-menu-container">
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
                    </div> */}
                </div>
            </header>
            <GlyphNameList nameList={sharedNameList} open={isGlyphSelectorOpen} onClose={handleGlyphSelectorClose} onItemSelected={handleGlyphSelected} />
            <GlyphOnionSkin glyphData={glyphData} settings={settings}></GlyphOnionSkin>
            {isLoading && <Loading />}
        </div>
    );
}
