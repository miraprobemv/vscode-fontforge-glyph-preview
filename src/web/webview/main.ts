import {} from "./global";
import {
    initializeUI,
    setupResizeFinishedEvent,
    showGlyphName,
    updateGlyphList,
} from "./ui";
import { GlyphStore } from "./glyphstore";
import { showGlyphSvgAsync } from "./sfd-to-svg";
import { postMessage, sendMessageAsync } from "./interop";

const vscode = acquireVsCodeApi();

setupResizeFinishedEvent();

const writeDebugLog = (message: string) =>
    postMessage(vscode, "writeDebugLog", { message });

writeDebugLog("Fontforge Glyph Preview is under initializing ...");

const sideMenu = document.getElementById("side-menu")!;
const openSideMenuButton = document.getElementById("open-side-menu-button")! as HTMLButtonElement;
const fileName = document.getElementById("file-name")!;
const glyphName = document.getElementById("glyph-name")!;
const glyphListContainer = document.getElementById("glyph-list-container")!;
const glyphContainer = document.getElementById("glyph-container")!;

const glyphStore = new GlyphStore();

initializeUI(sideMenu, openSideMenuButton);

async function getGlyphDataAsync(gid: number) {
    if (!glyphStore.has(gid)) {
        try {
            const glyphData: string[] = await sendMessageAsync(
                vscode,
                "fetchGlyphDataFromOtherFile",
                { gid: gid },
            );
            const glyphName = glyphData[0].split(" ")[1];
            glyphStore.addGlyph(gid, glyphName, glyphData);
            return glyphData;
        } catch (error) {
            glyphStore.addGlyph(gid, undefined, undefined);
            return undefined;
        }
    }
    return glyphStore.getGlyphData(gid);
}

async function showGlyphDataAsync(name: string, gid: number) {
    showGlyphName(glyphName, name);
    await showGlyphSvgAsync(glyphContainer, gid, (gid: number) => getGlyphDataAsync(gid));
}

window.addEventListener("message", async (event) => {
    if (event.data.type === "updateFontData") {
        const params = event.data.params;
        writeDebugLog("Received Font Data at " + params.timing + ".");

        fileName.textContent = params.fileName;

        glyphStore.clear();
        glyphStore.parseAllGlyphs(params.fontData);
        writeDebugLog("Update Glyph Store at " + params.timing + ".");

        const glyphNameToGidList = glyphStore.getAllGlyphNameToGidList();
        updateGlyphList(
            sideMenu,
            openSideMenuButton,
            glyphListContainer,
            glyphNameToGidList,
            async (name, gid) => {
                await showGlyphDataAsync(name, gid);
                postMessage(vscode, "storeCurrentGlyphName", { name });
            },
        );

        if (params.startupGlyph) {
            const gid = glyphStore.getGlyphGid(params.startupGlyph);
            if (!gid) { return; }
            await showGlyphDataAsync(params.startupGlyph, gid);
        } else if (glyphNameToGidList.length > 0) {
            const [name, gid] = glyphNameToGidList[0];
            await showGlyphDataAsync(name, gid);
        }
    }
});

window.addEventListener("resizeFinished", async () => {
    writeDebugLog("Window resizing was finished to re-render glyph image.");

    const currentGlyphName = glyphName.textContent;
    if (currentGlyphName) {
        const gid = glyphStore.getGlyphGid(currentGlyphName);
        if (!gid) { return; }
        await showGlyphDataAsync(currentGlyphName, gid);
    }
});

writeDebugLog("Event Listener Registered.");
postMessage(vscode, "ready");
