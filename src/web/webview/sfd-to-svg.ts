const MARKER_SIZE = 3; // Radius for point circles
const EPSILON = 0.01; // Tolerance for floating point comparisons

type Range = [min: number, max: number];
type ViewBox = [minX: number, minY: number, width: number, height: number];
type GlyphFetcher = (gid: number) => Promise<string[] | undefined>;
type PointTypes = "curve" | "corner" | "tangent" | "extreme" | "unknown";
type HandleData = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    forward: boolean;
};

/**
 * 指定されたコンテナに文字の SVG 画像を表示する。
 * @param container SVG を表示するコンテナ
 * @param gid 表示する文字の Glyph ID
 * @param getGlyphDataAsync 文字情報を取得するための関数
 */
export async function showGlyphSvgAsync(
    container: HTMLElement,
    gid: number,
    getGlyphDataAsync: GlyphFetcher,
) {
    for (const child of Array.from(container.children)) {
        container.removeChild(child); // Clear previous content
    }

    const glyphData = await getGlyphDataAsync(gid);
    if (!glyphData) { return; }

    const fontWidth = extractFontWidth(glyphData);
    const [refers, splineSet] = extractLayerData("Fore", glyphData);

    let viewBox = estimateViewBox(fontWidth, splineSet);
    if (refers.length > 0) {
        const referViewBox = await estimateReferViewBoxAsync(refers, getGlyphDataAsync);
        viewBox = mergeViewBox(viewBox, referViewBox);
    }
    viewBox = addMargineToViewBox(viewBox, 0.2);

    const [minX, minY, width, height] = viewBox;

    const svg = createSvgElement("svg", {
        "class": "glyph-svg",
        viewBox: `0 0 ${width} ${height}`,
        // viewBox: `${minX} ${minY} ${width} ${height}`,
    });

    container.appendChild(svg);

    const scale = Math.max(width / svg.clientWidth, height / svg.clientHeight);

    const coordinateSystem = createCoordinateSystemSvgElement(viewBox);
    svg.appendChild(coordinateSystem);

    const axisElements = createAxisSvgElements(viewBox, fontWidth, scale);
    for (const element of axisElements) {
        coordinateSystem.appendChild(element);
    }

    if (refers.length > 0) {
        const referElements = await parseReferGlyphToSvgElementsAsync(refers, scale, getGlyphDataAsync);
        for (const element of referElements) {
            coordinateSystem.appendChild(element);
        }
    }

    const pathElements = parsePathToSvgElements(splineSet, scale, "glyph-path");
    for (const element of pathElements) {
        coordinateSystem.appendChild(element);
    }

    const handleElements = parseHandleToSvgElements(splineSet, scale);
    for (const element of handleElements) {
        coordinateSystem.appendChild(element);
    }

    const pontElements = parsePointToSvgElements(splineSet, scale);
    for (const element of pontElements) {
        coordinateSystem.appendChild(element);
    }
}

// --------------------------------------------------------------------------
// SFD データ抽出

function extractFontWidth(lines: string[]): number {
    for (const line of lines) {
        if (line.startsWith("Width:")) {
            const width = parseFloat(line.split(":")[1].trim());
            return width;
        }
    }
    return 0; // Default value if not found
}

function extractLayerData(section: string, lines: string[]) {
    let inSection = false;
    let inSplineSet = false;
    const refers = [];
    const splineSet = [];
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
    return [refers, splineSet];
}

// --------------------------------------------------------------------------
// Viewbox のサイズ決定

function estimateViewBox(fontWidth: number, lines: string[]): ViewBox {
    let [minX, minY, maxX, maxY] = [0, 0, fontWidth, 0]; // Include matric origin and font width in the viewBox
    for (const line of lines) {
        if (line.trim() === "") { continue; }
        const commands = line.trim().split(" ");
        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            if (command === "m" || command === "l") {
                [minX, maxX] = expandRange(parseFloat(commands[0]), minX, maxX);
                [minY, maxY] = expandRange(parseFloat(commands[1]), minY, maxY);
                break;
            } else if (command === "c") {
                for (let j = 0; j < 3; j++) {
                    [minX, maxX] = expandRange(parseFloat(commands[j * 2 + 0]), minX, maxX);
                    [minY, maxY] = expandRange(parseFloat(commands[j * 2 + 1]), minY, maxY);
                }
                break;
            }
        }
    }
    return [minX, minY, maxX - minX, maxY - minY];
}

function expandRange(newValue: number, min: number, max: number): Range {
    min = Math.min(min, newValue);
    max = Math.max(max, newValue);
    return [min, max];
}

async function estimateReferViewBoxAsync(
    refers: string[],
    getGlyphDataAsync: GlyphFetcher,
): Promise<ViewBox> {
    let viewBox: ViewBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const refer of refers) {
        const [gid, codepoint, selection, a, b, c, d, e, f, ...rest] = refer.split(":")[1].trim().split(" ");

        const glyphData = await getGlyphDataAsync(parseInt(gid));
        if (!glyphData) { continue; }

        const [refers, splineSet] = extractLayerData("Fore", glyphData);
        if (refers.length > 0) {
            const referViewBox = await estimateReferViewBoxAsync(refers, getGlyphDataAsync);
            viewBox = mergeViewBox(viewBox, referViewBox);
        }
        if (splineSet.length > 0) {
            viewBox = mergeViewBox(
                viewBox,
                affinTransformViewBox(
                    estimateViewBox(0, splineSet),
                    parseFloat(a),
                    parseFloat(b),
                    parseFloat(c),
                    parseFloat(d),
                    parseFloat(e),
                    parseFloat(f),
                ),
            );
        }
    }
    return viewBox;
}

function affinTransformViewBox(
    viewBox: ViewBox,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
): ViewBox {
    const [minX, minY, width, height] = viewBox;
    const maxX = width - minX;
    const maxY = height - minY;

    const newMinX = a * minX + c * minY + e;
    const newMaxX = a * maxX + c * maxY + e;
    const newMinY = b * minX + d * minY + f;
    const newMaxY = b * maxX + d * maxY + f;

    const newWidth = newMaxX - newMinX;
    const newHeight = newMaxY - newMinY;
    return [minX, minY, newWidth, newHeight];
}

function mergeViewBox(viewBox1: ViewBox, viewBox2: ViewBox): ViewBox {
    const [minX1, minY1, width1, height1] = viewBox1;
    const maxX1 = width1 - minX1;
    const maxY1 = height1 - minY1;
    const [minX2, minY2, width2, height2] = viewBox2;
    const maxX2 = width2 - minX2;
    const maxY2 = height2 - minY2;

    const minX = Math.min(minX1, minX2);
    const minY = Math.min(minY1, minY2);
    const maxX = Math.max(maxX1, maxX2);
    const maxY = Math.max(maxY1, maxY2);
    const width = maxX - minX;
    const height = maxY - minY;

    return [minX, minY, width, height];
}

function addMargineToViewBox(viewBox: ViewBox, marginRate: number): ViewBox {
    const [minX, minY, width, height] = viewBox;
    const margin = Math.max(width, height) * marginRate;
    return [
        minX - margin,
        minY - margin,
        width + 2 * margin,
        height + 2 * margin,
    ];
}

// --------------------------------------------------------------------------
// 文字データ解析

async function parseReferGlyphToSvgElementsAsync(
    refers: string[],
    scale: number,
    getGlyphDataAsync: GlyphFetcher,
): Promise<SVGElement[]> {
    const elements: SVGElement[] = [];
    for (const refer of refers) {
        const [gid, codepoint, selection, a, b, c, d, e, f, ...rest] = refer.split(":")[1].trim().split(" ");

        const glyphData = await getGlyphDataAsync(parseInt(gid));
        if (!glyphData) { continue; }

        const [refers, splineSet] = extractLayerData("Fore", glyphData);
        if (refers) {
            const referElements = await parseReferGlyphToSvgElementsAsync(refers, scale, getGlyphDataAsync);
            for (const e of referElements) {
                elements.push(e);
            }
        }
        if (splineSet) {
            const coordinateSystem = createAffineTransformSvgElement(
                parseFloat(a),
                parseFloat(b),
                parseFloat(c),
                parseFloat(d),
                parseFloat(e),
                parseFloat(f),
            );

            const pathElements = parsePathToSvgElements(splineSet, scale, "refer-glyph-path");
            for (const element of pathElements) {
                coordinateSystem.appendChild(element);
            }

            elements.push(coordinateSystem);
        }
    }
    return elements;
}

function parsePathToSvgElements(
    lines: string[],
    scale: number,
    className: string,
): SVGElement[] {
    const svgElements: SVGElement[] = [];
    const pathDataList: string[] = [];
    for (const line of lines) {
        if (line.trim() === "") { continue; }
        // if (!line.startsWith(' ') && pathDataList.length > 0) {
        //     svgElements.push(createPathSvgElement(pathDataList));
        //     pathDataList.splice(0);
        // }
        const args = line.trim().split(" ");
        for (let i = 0; i < args.length; i++) {
            const command = args[i];
            if (command === "m") {
                pathDataList.push(`M ${args[0]} ${args[1]}`);
                break;
            } else if (command === "l") {
                pathDataList.push(`L ${args[0]} ${args[1]}`);
                break;
            } else if (command === "c") {
                pathDataList.push(`C ${args[0]} ${args[1]} ${args[2]} ${args[3]} ${args[4]} ${args[5]}`);
                break;
            }
        }
    }
    svgElements.push(createPathSvgElement(pathDataList, scale, className));
    return svgElements;
}

function parsePointToSvgElements(lines: string[], scale: number): SVGElement[] {
    const svgElements: SVGElement[] = [];
    for (const line of lines) {
        if (line.trim() === "") { continue; }
        const args = line.trim().split(" ");
        for (let i = 0; i < args.length; i++) {
            const command = args[i];
            // if (command === 'm') {
            //     const pointType = parsePointType(args[3]);
            //     svgElements.push(createPontSvgElement(args[0], args[1], pointType, true, scale));
            //     break;
            // }
            if (command === "l") {
                const pointType = parsePointType(args[3]);
                svgElements.push(
                    createPontSvgElement(parseFloat(args[0]), parseFloat(args[1]), pointType, false, scale)
                );
                break;
            }
            if (command === "c") {
                const pointType = parsePointType(args[7]);
                svgElements.push(
                    createPontSvgElement(parseFloat(args[4]), parseFloat(args[5]), pointType, false, scale)
                );
                break;
            }
        }
    }
    return svgElements;
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
            return "unknown";
    }
}

function parseHandleToSvgElements(
    lines: string[],
    scale: number,
): SVGElement[] {
    const svgElements: SVGElement[] = [];
    const handleDataList: HandleData[] = [];
    let last = { x: 0, y: 0 };
    for (const line of lines) {
        if (line.trim() === "") { continue; }
        const args = line.trim().split(" ");
        for (let i = 0; i < args.length; i++) {
            const command = args[i];
            if (command === "m" || command === "l") {
                last = { x: parseFloat(args[0]), y: parseFloat(args[1]) };
                break;
            } else if (command === "c") {
                handleDataList.push({
                    x1: last.x,
                    y1: last.y,
                    x2: parseFloat(args[0]),
                    y2: parseFloat(args[1]),
                    forward: true,
                });
                handleDataList.push({
                    x1: parseFloat(args[4]),
                    y1: parseFloat(args[5]),
                    x2: parseFloat(args[2]),
                    y2: parseFloat(args[3]),
                    forward: false,
                });
                last = { x: parseFloat(args[4]), y: parseFloat(args[5]) };
                break;
            }
        }
    }
    for (const handleData of handleDataList) {
        for (const element of createHandleSvgElements(handleData, scale)) {
            svgElements.push(element);
        }
    }
    return svgElements;
}

// --------------------------------------------------------------------------
// SVG エレメント作成

function createSvgElement(
    tag: string,
    attributes: { [key: string]: any } = {},
) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) {
        svg.setAttribute(key, value);
    }
    return svg;
}

function createCoordinateSystemSvgElement(viewBox: ViewBox): SVGElement {
    const [minX, minY, width, height] = viewBox;
    const svg = createSvgElement("g", {
        transform: `translate(0, ${minY}), scale(1, -1), translate(${-minX}, ${-height})`,
    });
    return svg;
}

function createAffineTransformSvgElement(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
): SVGElement {
    const svg = createSvgElement("g", {
        transform: `matrix(${a} ${b} ${c} ${d} ${e} ${f})`,
    });
    return svg;
}

function createAxisSvgElements(
    viewBox: ViewBox,
    fontWidth: number,
    scale: number,
) {
    const [minX, minY, width, height] = viewBox;

    const axisX = createSvgElement("line", {
        "class": "axis",
        x1: minX,
        y1: 0,
        x2: minX + width,
        y2: 0,
        stroke: "currentColor",
        "stroke-width": scale,
    });

    const axisY = createSvgElement("line", {
        "class": "axis",
        x1: 0,
        y1: minY,
        x2: 0,
        y2: minY + height,
        stroke: "currentColor",
        "stroke-width": scale,
    });

    const widthLine = createSvgElement("line", {
        "class": "font-width-line",
        x1: fontWidth,
        y1: minY,
        x2: fontWidth,
        y2: minY + height,
        stroke: "currentColor",
        "stroke-width": scale,
    });

    return [axisX, axisY, widthLine];
}

function createPathSvgElement(
    pathDataList: string[],
    scale: number,
    className: string,
): SVGElement {
    const data = pathDataList.join(" ");
    const svg = createSvgElement("path", {
        "class": className,
        d: data,
        fill: "currentColor",
        stroke: "currentColor",
        "stroke-width": scale,
    });
    return svg;
}

function createPontSvgElement(
    x: number,
    y: number,
    type: PointTypes,
    start: boolean,
    scale: number,
): SVGElement {
    const sizeBase = MARKER_SIZE * scale * (start ? 1.75 : 1.0);
    const className = start ? "glyph-start-point" : "glyph-point";
    const fillColor = start ? "none" : "currentColor";
    let svg: SVGElement;
    switch (type) {
        case "corner": {
            const size = sizeBase * 0.8;
            svg = createSvgElement("path", {
                "class": className,
                d: `M ${x - size} ${y - size} h ${2 * size} v ${2 * size} h ${-2 * size} Z`,
                fill: fillColor,
                stroke: "currentColor",
                "stroke-width": scale,
            });
            break;
        }
        case "tangent": {
            const size = sizeBase * 1.2;
            svg = createSvgElement("path", {
                "class": className,
                d: `M ${x} ${y - size} l ${size} ${size} l ${-1 * size} ${size} l ${-1 * size} ${-1 * size} Z`,
                fill: fillColor,
                stroke: "currentColor",
                "stroke-width": scale,
            });
            break;
        }
        default: {
            const size = sizeBase;
            svg = createSvgElement("circle", {
                "class": className,
                cx: x,
                cy: y,
                r: size,
                fill: fillColor,
                stroke: "currentColor",
                "stroke-width": scale,
            });
            break;
        }
    }
    return svg;
}

function createHandleSvgElements(
    handleData: HandleData,
    scale: number,
): SVGElement[] {
    const { x1, y1, x2, y2, forward } = handleData;
    if (nearlyEqual(x1, x2) && nearlyEqual(y1, y2)) {
        return [];
    }

    const className = forward ? "glyph-forward-handle" : "glyph-backward-handle";

    const radius = MARKER_SIZE * scale;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const dxShortened = dx * (length - radius) / length;
    const dyShortened = dy * (length - radius) / length;
    const line = createSvgElement("line", {
        "class": className,
        x1: x1,
        y1: y1,
        x2: x1 + dxShortened,
        y2: y1 + dyShortened,
        stroke: "currentColor",
        "stroke-width": scale,
    });
    const handle = createSvgElement("circle", {
        "class": className,
        cx: x2,
        cy: y2,
        r: radius,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": scale,
    });

    return [line, handle];
}

function nearlyEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < EPSILON;
}
