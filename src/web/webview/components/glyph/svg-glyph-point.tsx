import React from "react";
import { MARKER_SIZE } from "../../libs/glyph";
import { PathPoint } from "../../libs/glyph";

type Props = {
    points: PathPoint[];
    scale: number;
};
export default function SvgGlyphPoint({
    points,
    scale,
}: Props) {

    return (
        <g className="glyph-handle">
            {points.map((pathPoint, idx) => {
                const { point, pointType, start } = pathPoint;
                const sizeBase = MARKER_SIZE * scale * (start ? 1.75 : 1.0);
                const className = start ? "glyph-start-point" : "glyph-point";
                const fillColor = start ? "none" : "currentColor";
                switch (pointType) {
                    case "corner": {
                        const size = sizeBase * 0.8;
                        return (
                            <path
                                key={idx}
                                className={className}
                                d={`M ${point.x - size} ${point.y - size} h ${2 * size} v ${2 * size} h ${-2 * size} Z`}
                                fill={fillColor}
                                stroke="currentColor"
                                strokeWidth={scale} />
                        );
                    }
                    case "tangent": {
                        const size = sizeBase * 1.2;
                        return (
                            <path
                                key={idx}
                                className={className}
                                d={`M ${point.x} ${point.y - size} l ${size} ${size} l ${-1 * size} ${size} l ${-1 * size} ${-1 * size} Z`}
                                fill={fillColor}
                                stroke="currentColor"
                                strokeWidth={scale} />
                        );
                    }
                    default: {
                        const size = sizeBase;
                        return (
                            <circle
                                key={idx}
                                className={className}
                                cx={point.x}
                                cy={point.y}
                                r={size}
                                fill={fillColor}
                                stroke="currentColor"
                                strokeWidth={scale} />
                        );
                    }
                }
            })}
        </g>
    );
}
