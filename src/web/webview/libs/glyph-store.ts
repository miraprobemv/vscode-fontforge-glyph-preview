import { extractFontWidth, extractLayerData, parseReferDataAsync, parseSplineSet, GlyphDataStringFetcher, GlyphEncoding } from "./sfd";
import { GlyphData } from "./glyph";

export class GlyphStore {
    glyphs: Map<number, string[] | undefined>;
    glyphCache: Map<number, GlyphData>;
    nameToEncoding: Map<string, GlyphEncoding>;

    constructor() {
        this.glyphs = new Map();
        this.nameToEncoding = new Map();
        this.glyphCache = new Map();
    }

    parseAllGlyphs(sfdData: string[]) {
        let currentEncoding = null;
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
                    if (currentEncoding !== null) {
                        this.addGlyph(currentEncoding.gid, currentGlyphName, currentEncoding, currentGlyphData);
                    }
                    currentEncoding = null;
                    currentGlyphName = null;
                    currentGlyphData = [];
                    inGlyph = false;
                }
            } else if (inGlyph) {
                if (line.startsWith("Encoding:")) {
                    const parts = line.split(" ");
                    if (parts.length >= 4) {
                        currentEncoding = {
                            codepoint: parseInt(parts[1], 10),
                            unicode: parseInt(parts[2], 10),
                            gid: parseInt(parts[3], 10),
                        };
                    }
                }
                currentGlyphData.push(line);
            }
        }
    }

    addGlyph(
        gid: number,
        name: string | undefined,
        encoding: GlyphEncoding | undefined,
        glyphData: string[] | undefined,
    ) {
        this.glyphs.set(gid, glyphData);
        if (name && encoding) {
            this.nameToEncoding.set(name, encoding);
        }
        if (this.glyphCache.has(gid)) {
            this.glyphCache.delete(gid);
        }
    }

    getGlyphGid(name: string): number | undefined {
        return this.nameToEncoding.get(name)?.gid;
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

    getAllGlyphNameToGidList(): [name: string, gid: number][] {
        return Array.from(this.nameToEncoding.entries()).map(([name, encoding]) => [name, encoding.gid] as [string, number]).sort(
            (a, b) => (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? +1 : 0
        );
    }

    getAllGlyphNameToEncodingList(): [name: string, encoding: GlyphEncoding][] {
        return Array.from(this.nameToEncoding.entries()).sort(
            (a, b) => (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? +1 : 0
        );
    }
    
    getAllGlyphEncodingList(): [codepoint: number, name: string, gid: number][] {
        return Array.from(this.nameToEncoding.entries()).map(([name, encoding]) => [encoding.codepoint, name, encoding.gid] as [number, string, number]).sort(
            (a, b) => (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? +1 : 0
        );
    }

    clear() {
        this.glyphs.clear();
        this.glyphCache.clear();
        this.nameToEncoding.clear();
    }
    
    dispose(): void {
        this.clear();
    }
}
