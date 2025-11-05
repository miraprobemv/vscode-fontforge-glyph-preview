import { extractFontWidth, extractLayerData, parseReferDataAsync, parseSplineSet, GlyphDataStringFetcher } from "./sfd";
import { GlyphData } from "./glyph";


export class GlyphStore {
    glyphs: Map<number, string[] | undefined>;
    glyphCache: Map<number, GlyphData>;
    nameToGid: Map<string, number>;

    constructor() {
        this.glyphs = new Map();
        this.nameToGid = new Map();
        this.glyphCache = new Map();
    }

    parseAllGlyphs(sfdData: string[]) {
        let currentGID = -1;
        let currentGlyphName = null;
        let currentGlyphData: string[] = [];
        let inGlyph = false;

        for (const line of sfdData) {
            if (line.startsWith("StartChar:")) {
                inGlyph = true;
                currentGlyphName = line.split(" ")[1];
                currentGlyphData = [line];
            } else if (line.startsWith("EndChar")) {
                if (inGlyph && currentGlyphName) {
                    currentGlyphData.push(line);
                    if (currentGID !== -1) {
                        this.addGlyph(currentGID, currentGlyphName, currentGlyphData);
                    }
                    currentGID = -1;
                    currentGlyphName = null;
                    currentGlyphData = [];
                    inGlyph = false;
                }
            } else if (inGlyph) {
                if (line.startsWith("Encoding:")) {
                    const parts = line.split(" ");
                    if (parts.length >= 4) {
                        currentGID = parseInt(parts[3], 10);
                    }
                }
                currentGlyphData.push(line);
            }
        }
    }

    addGlyph(
        gid: number,
        name: string | undefined,
        glyphData: string[] | undefined,
    ) {
        this.glyphs.set(gid, glyphData);
        if (name) {
            this.nameToGid.set(name, gid);
        }
        if (this.glyphCache.has(gid)) {
            this.glyphCache.delete(gid);
        }
    }

    getGlyphGid(name: string): number | undefined {
        return this.nameToGid.get(name);
    }

    has(gid: number): boolean {
        return this.glyphs.has(gid);
    }

    getGlyphDataString(gid: number): string[] | undefined {
        return this.glyphs.get(gid);
    }

    async getGlyphDataAsync(gid: number, getGlyphDataStringAsync: GlyphDataStringFetcher): Promise<GlyphData | undefined> {
        
        const glyphData = await getGlyphDataStringAsync(gid);
        if (!glyphData) { return; }

        const fontWidth = extractFontWidth(glyphData);
        const { splineSet, refers } = extractLayerData("Fore", glyphData);

        const glyphPaths = parseSplineSet(splineSet);
        const glyphRefers = await parseReferDataAsync(refers, getGlyphDataStringAsync);
        return {
            width: fontWidth,
            paths: glyphPaths,
            refers: glyphRefers,
        };
    }

    getAllGlyphNameToGidList(): [string, number][] {
        return Array.from(this.nameToGid.entries()).sort(
            (a, b) => (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? +1 : 0
        );
    }

    clear() {
        this.glyphs.clear();
        this.nameToGid.clear();
    }
    
    dispose(): void {
        this.clear();
    }
}
