import { PathOperation, PointTypes, GlyphRefer } from "./glyph";
import { AffineParam } from "./metrics";

export type GlyphDataStringFetcher = (gid: number) => Promise<string[] | undefined>;


// --------------------------------------------------------------------------
// SFD データ抽出

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

export function extractFontWidth(lines: string[]): number {
    for (const line of lines) {
        if (line.startsWith("Width:")) {
            const width = parseFloat(line.split(":")[1].trim());
            return width;
        }
    }
    return 0; // Default value if not found
}

export function extractLayerData(section: string, lines: string[]): { splineSet: string[], refers: string[] } {
    let inSection = false;
    let inSplineSet = false;
    const splineSet = [];
    const refers = [];
    for (const line of lines) {
        if (line.startsWith(section)) {
            inSection = true;
            continue;
        }
        if (inSection) {
            if (line.startsWith("Refer:")) {
                refers.push(line);
                continue;
            } else if (line.startsWith("SplineSet")) {
                inSplineSet = true;
                continue;
            } else if (line.startsWith("EndSplineSet")) {
                inSplineSet = false;
                continue;
            } else if (inSplineSet) {
                splineSet.push(line);
                continue;
            } else {
                break;
            }
        }
    }
    return { splineSet, refers };
}

// --------------------------------------------------------------------------
// 文字データ解析

export function parseSplineSet(
    lines: string[]
): PathOperation[] {
    const glyphPaths: PathOperation[] = [];
    for (const line of lines) {
        if (line.trim() === "") { continue; }
        const args = line.trim().split(" ");
        if (args[2] === "m") {
            glyphPaths.push({
                type: "M",
                point: {x: parseFloat(args[0]), y: parseFloat(args[1])},
                pointType: parsePointType(args[3]),
                start: true,
            });
        } else if (args[2] === "l") {
            glyphPaths.push({
                type: "L",
                point: {x: parseFloat(args[0]), y: parseFloat(args[1])},
                pointType: parsePointType(args[3]),
                start: false,
            });
        } else if (args[6] === "c") {
            glyphPaths.push({
                type: "C",
                controlPoints: [
                    {x: parseFloat(args[0]), y: parseFloat(args[1])},
                    {x: parseFloat(args[2]), y: parseFloat(args[3])},
                ],
                point: {x: parseFloat(args[4]), y: parseFloat(args[5])},
                pointType: parsePointType(args[7]),
                start: false,
            });
        }
    }
    return glyphPaths;
}

function parsePointType(arg: string): PointTypes {
    let pointFlags;
    if (arg.indexOf("x") >= 0) {
        pointFlags = parseInt(arg.substring(0, arg.indexOf("x")));
    } else {
        pointFlags = parseInt(arg);
    }
    switch (pointFlags % 4) {
        case 0:
            return "curve";
        case 1:
            return "corner";
        case 2:
            return "tangent";
        case 3:
            return "extreme";
        default:
            throw new Error("unknown point type");
    }
}

export async function parseReferDataAsync(
    refers: string[],
    getGlyphDataStringAsync: GlyphDataStringFetcher,
): Promise<GlyphRefer[]> {
    const referDataList: GlyphRefer[] = [];
    for (const refer of refers) {
        const [gid, codepoint, selection, a, b, c, d, e, f, ...rest] = refer.split(":")[1].trim().split(" ");
        const glyphData = await getGlyphDataStringAsync(parseInt(gid));
        if (!glyphData) { continue; }

        const { splineSet, refers } = extractLayerData("Fore", glyphData);
        const affineParam: AffineParam = [
            parseFloat(a),
            parseFloat(b),
            parseFloat(c),
            parseFloat(d),
            parseFloat(e),
            parseFloat(f),
        ];
        const referOfReferList = (refers.length > 0) ? await parseReferDataAsync(refers, getGlyphDataStringAsync) : [];
        const glyphPaths = (splineSet.length > 0) ? parseSplineSet(splineSet) : [];

        referDataList.push({affineParam, glyphPaths: glyphPaths, refers: referOfReferList});
    }
    return referDataList;
}
