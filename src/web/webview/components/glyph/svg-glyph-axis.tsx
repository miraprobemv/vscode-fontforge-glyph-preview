import React, { useMemo } from "react";
import { ViewBox } from "../../libs/metrics";

type Props = {
    viewBox: ViewBox;
    width: number;
    scale: number;
};
export default function SvgGlyphAxis({
    viewBox,
    width: fontWidth,
    scale,
}: Props) {

    const [minX, minY, width, height] = useMemo(() => viewBox, [viewBox]);

    return (
        <g className="font-axis">
            <line
                className="axis"
                x1={minX}
                y1={0}
                x2={minX + width}
                y2={0}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={scale} />
            <line
                className="axis"
                x1={0}
                y1={minY}
                x2={0}
                y2={minY + height}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={scale} />
            <line
                className="font-width-line"
                x1={fontWidth}
                y1={minY}
                x2={fontWidth}
                y2={minY + height}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={scale} />
        </g>
    );
}
