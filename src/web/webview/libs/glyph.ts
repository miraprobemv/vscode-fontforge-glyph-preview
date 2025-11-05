import { ViewBox, expandRange, AffineParam, affineTransformPoint, Point, bezirPoint, getCircleBy3Points, interpolatePoint } from "./metrics";

export const MARKER_SIZE = 3;

export type PointTypes = "curve" | "corner" | "tangent" | "extreme";
export type PathMoveTo = {
    type: "M";
    point: Point;
    pointType: PointTypes;
    start: true;
};
export type PathLineTo = {
    type: "L";
    point: Point;
    pointType: PointTypes;
    start: false;
};
export type PathCurveTo = {
    type: "C";
    controlPoints: [Point, Point];
    point: Point;
    pointType: PointTypes;
    start: false;
};
export type PathOperation = PathMoveTo | PathLineTo | PathCurveTo;

export type GlyphRefer = {
    affineParam: AffineParam;
    glyphPaths: PathOperation[];
    refers: GlyphRefer[];
};

export type GlyphData = {
    width: number;
    paths: PathOperation[];
    refers: GlyphRefer[];
};

export type PathPoint = {
    point: Point;
    pointType: PointTypes;
    start: boolean;
};

export type PathHandle = {
    root: Point;
    end: Point;
    forward: boolean;
};

export type Comb = {
    root: Point;
    end: Point;
};


export function estimateViewBox(fontWidth: number, glyphPaths: PathOperation[]): ViewBox {
    let [minX, minY, maxX, maxY] = [0, 0, fontWidth, 0]; // Include matric origin and font width in the viewBox
    for (const op of glyphPaths) {
        [minX, maxX] = expandRange(op.point.x, minX, maxX);
        [minY, maxY] = expandRange(op.point.y, minY, maxY);
        if (op.type === "C") {
            for (const controlPoint of op.controlPoints) {
                [minX, maxX] = expandRange(controlPoint.x, minX, maxX);
                [minY, maxY] = expandRange(controlPoint.y, minY, maxY);
            }
        }
    }
    return [minX, minY, maxX - minX, maxY - minY];
}

export function estimateReferViewBox(
    refers: GlyphRefer[]): ViewBox {
    let viewBox: ViewBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const refer of refers) {
        let subViewBox: ViewBox = [Infinity, Infinity, -Infinity, -Infinity];
        if (refer.refers.length === 0 && refer.glyphPaths.length === 0) { continue; }

        if (refer.refers.length > 0) {
            const referViewBox = estimateReferViewBox(refer.refers);
            subViewBox = mergeViewBox(subViewBox, referViewBox);
        }
        if (refer.glyphPaths.length > 0) {
            const referViewBox = estimateViewBox(0, refer.glyphPaths);
            subViewBox = mergeViewBox(subViewBox, referViewBox);
        }
        viewBox = mergeViewBox(
            viewBox,
            affineTransformViewBox(subViewBox, refer.affineParam)
        );
    }
    return viewBox;
}

function affineTransformViewBox(
    viewBox: ViewBox,
    affineParam: AffineParam
): ViewBox {
    const [minX, minY, width, height] = viewBox;

    const maxX = minX + width;
    const maxY = minY + height;

    const { x: newMinX, y: newMinY } = affineTransformPoint({ x: minX, y: minY }, affineParam);
    const { x: newMaxX, y: newMaxY } = affineTransformPoint({ x: maxX, y: maxY }, affineParam);

    const newWidth = newMaxX - newMinX;
    const newHeight = newMaxY - newMinY;

    return [newMinX, newMinY, newWidth, newHeight];
}

export function mergeViewBox(viewBox1: ViewBox, viewBox2: ViewBox): ViewBox {
    const [minX1, minY1, width1, height1] = viewBox1;

    const [minX2, minY2, width2, height2] = viewBox2;

    const minX = Math.min(minX1, minX2);
    const minY = Math.min(minY1, minY2);
    const width = Math.max(width1, width2);
    const height = Math.max(height1, height2);

    return [minX, minY, width, height];
}

export function addMargineToViewBox(viewBox: ViewBox, marginRate: number): ViewBox {
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
// グリフパス付随情報の変換

export function calcHandles(
    opList: PathOperation[]
): PathHandle[] {
    const handleDataList: PathHandle[] = [];
    let last: Point = { x: 0, y: 0 };
    for (const op of opList) {
        if (op.type === "M" || op.type === "L") {
            last = op.point;
        } else if (op.type === "C") {
            handleDataList.push({
                root: last,
                end: op.controlPoints[0],
                forward: true,
            });
            handleDataList.push({
                root: op.point,
                end: op.controlPoints[1],
                forward: false,
            });
            last = op.point;
        }
    }
    return handleDataList;
}


export function calcCurvatureCombs(glyphPaths: PathOperation[], scale: number): Comb[] {
    if (glyphPaths.length === 0) { return []; }
    let latest: Point = glyphPaths[0].point;
    const combs: Comb[] = [];
    for (const op of glyphPaths) {
        if (op.type !== "C") {
            latest = op.point;
            continue;
        }
        // 櫛の歯の分割数を計算。1pxにつき1本出るようにしたい。
        let div = 2;
        while (true) {
            const testP = bezirPoint([latest, ...op.controlPoints, op.point], 1 / div);
            const testD2 = Math.pow(testP.x - latest.x, 2) + Math.pow(testP.y - latest.y, 2);
            if (testD2 < Math.pow(10, 2)) {
                const testD = Math.sqrt(testD2);
                div = Math.round(div * testD / scale);
                break;
            }
            div *= 2;
        }
        const p: Point[] = [];
        p.push(bezirPoint([latest, ...op.controlPoints, op.point], 1 / (div * 2)));
        // 曲線の端の部分の計算用（開始）
        for (let i = 0; i <= div; i++) {
            p.push(bezirPoint([latest, ...op.controlPoints, op.point], i / div));
        }
        // 曲線の端の部分の計算用（終了）。ただし曲線が連続する場合は接続部分が重複するため省く
        if (op.pointType === "corner" || op.pointType === "tangent") {
            p.push(bezirPoint([latest, ...op.controlPoints, op.point], (div * 2 - 1) / (div * 2)));
        }
        for (let i = 1; i < p.length - 1; i++) {
            const c = getCircleBy3Points([p[i - 1], p[i], p[i + 1]]);
            if (c.r === 0) { continue; }
            const comb = {
                root: p[i],
                // end: interpolatePoint(p[i], ((c.r + (1 / c.r) * 1000 * scale * 1.5) / c.r), c),
                end: interpolatePoint(p[i], ((c.r + (1 / c.r) * 1000 * 1.5) / c.r), c),
            };
            combs.push(comb);
        }
        latest = op.point;
    }
    return combs;
}