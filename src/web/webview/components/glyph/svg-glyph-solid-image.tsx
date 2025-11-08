import React, { useMemo } from "react";
import { PathOperation } from "../../libs/glyph";
import { ViewBox } from "../../libs/metrics";

type Props = {
    id: string;
    paths: PathOperation[];
    viewBox: ViewBox;
    className: string;
    opacity?: number;
};
export default function SvgGlyphSolidImage({
    id,
    paths,
    viewBox,
    className,
    opacity,
}: Props) {

    const data = useMemo(() => {
        const pathDataList: string[] = [];
        for (const op of paths) {
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
    }, [paths]);

    const [x, y, width, height] = viewBox;
    opacity = opacity ?? 1.0;

    return (
         <g className="glyph-solid-image">
            <clipPath id={id}>
                <path
                    d={data}
                />
            </clipPath>
            <rect
                className={className}
                x={x}
                y={y}
                width={width}
                height={height}
                fill="currentColor"
                stroke="currentColor"
                opacity={opacity}
                clip-path={`url(#${id})`}
            />
        </g>
    );
}
