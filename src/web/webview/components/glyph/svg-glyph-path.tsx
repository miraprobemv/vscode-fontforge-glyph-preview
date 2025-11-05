import React, { useMemo } from "react";
import { PathOperation } from "../../libs/glyph";

type Props = {
    paths: PathOperation[];
    scale: number;
    className: string;
};
export default function SvgGlyphPath({
    paths: glyphPaths,
    scale,
    className,
}: Props) {

    const data = useMemo(() => {
        const pathDataList: string[] = [];
        for (const op of glyphPaths) {
            switch (op.type) {
                case "M":
                    pathDataList.push(`M ${op.point.x} ${op.point.y}`);
                    break;
                case "L":
                    pathDataList.push(`L ${op.point.x} ${op.point.y}`);
                    break;
                case "C":
                    pathDataList.push(`C ${op.controlPoints[0].x} ${op.controlPoints[0].y} ${op.controlPoints[1].x} ${op.controlPoints[1].y} ${op.point.x} ${op.point.y}`);
                    break;
            }
        }
        const data = pathDataList.join(" ");
        return data;
    }, [glyphPaths]);

    return (
        <path
            className={className}
            d={data}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={scale} />
    );
}
