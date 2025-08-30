export class GlyphStore {
    glyphs: Map<number, string[] | undefined>;
    nameToGid: Map<string, number>;

    constructor() {
        this.glyphs = new Map();
        this.nameToGid = new Map();
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
    }

    getGlyphGid(name: string): number | undefined {
        return this.nameToGid.get(name);
    }

    has(gid: number): boolean {
        return this.glyphs.has(gid);
    }

    getGlyphData(gid: number): string[] | undefined {
        return this.glyphs.get(gid);
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
}
