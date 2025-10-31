export function extractGlyphName(sfdData: string[]): string {
    for (const line of sfdData) {
        if (line.startsWith("StartChar:")) {
            const glyphName = line.split(" ")[1];
            return glyphName;
        }
    }
    throw new Error("Glyph name is not found.");
}

export function extractGid(sfdData: string[]): number {
    for (const line of sfdData) {
        if (line.startsWith("Encoding:")) {
            const parts = line.split(" ");
            if (parts.length >= 4) {
                const gid = parseInt(parts[3], 10);
                return gid;
            }
        }
    }
    throw new Error("GID is not found.");
}