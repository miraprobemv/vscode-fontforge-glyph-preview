const EPSILON = 0.01; // Tolerance for floating point comparisons

export type Range = [min: number, max: number];

export type ViewBox = [minX: number, minY: number, width: number, height: number];

export type AffineParam = [a: number, b: number, c: number, d: number, e: number, f: number];

export type Point = {
    x: number;
    y: number;
};

export type Circle = {
    x: number;
    y: number;
    r: number;
};


export function expandRange(newValue: number, min: number, max: number): Range {
    min = Math.min(min, newValue);
    max = Math.max(max, newValue);
    return [min, max];
}

export function nearlyEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < EPSILON;
}

export function interpolatePoint(p1: Point, ratio: number, p2: Point): Point {
    return {
        x: interpolate(p1.x, ratio, p2.x),
        y: interpolate(p1.y, ratio, p2.y),
    };
}

export function interpolate(a: number, ratio: number, b: number): number {
    return ratio * a + (1 - ratio) * b;
}

export function affineTransformPoint(
    point: Point,
    affineParam: AffineParam
): Point {
    const [a, b, c, d, e, f] = affineParam;
    return {
        x: a * point.x + c * point.y + e,
        y: b * point.x + d * point.y + f,
    };
}

export function bezirPoint(p: [Point, Point, Point, Point], t: number): Point {
    const x =
        Math.pow(1.0 - t, 3) * p[0].x
        + 3 * t * Math.pow(1.0 - t,2) * p[1].x
        + 3 * Math.pow(t, 2) * (1.0 - t) * p[2].x
        + Math.pow(t, 3) * p[3].x;
    const y =
        Math.pow(1.0 - t, 3) * p[0].y
        + 3 * t * Math.pow((1.0 - t),2) * p[1].y
        + 3 * Math.pow(t, 2) * (1.0 - t) * p[2].y
        + Math.pow(t, 3) * p[3].y;
    return {x, y};
}

export function getCircleBy3Points(p: [Point, Point, Point]): Circle {
    // 3点 (x0,y0) (x1,y1) (x2,y2) を通る円を計算
    const d = ((p[0].y - p[2].y) * (p[0].x - p[1].x) - (p[0].y - p[1].y) * (p[0].x - p[2].x)) * 2;
    const x = ((p[0].y - p[2].y) * (p[0].y ** 2 - p[1].y ** 2 + p[0].x ** 2 - p[1].x ** 2) - (p[0].y - p[1].y) * (p[0].y ** 2 - p[2].y ** 2 + p[0].x ** 2 - p[2].x ** 2)) / d;
    const y = ((p[0].x - p[2].x) * (p[0].x ** 2 - p[1].x ** 2 + p[0].y ** 2 - p[1].y ** 2) - (p[0].x - p[1].x) * (p[0].x ** 2 - p[2].x ** 2 + p[0].y ** 2 - p[2].y ** 2)) / -d;
    const r = Math.sqrt((x - p[0].x) ** 2 + (y - p[0].y) ** 2);
    return {x, y, r};
}
