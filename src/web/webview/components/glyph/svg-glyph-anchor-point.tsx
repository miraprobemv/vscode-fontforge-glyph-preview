import React from "react";
import { MARKER_SIZE } from "../../libs/glyph";
import { AnchorPoint } from "../../libs/glyph";

type Props = {
    anchorPoints: AnchorPoint[];
    scale: number;
};
export default function SvgGlyphAnchorPoint({
    anchorPoints,
    scale,
}: Props) {

    return (
        <g className="glyph-anchor-point-group">
            {anchorPoints.map((anchorPoint) => {
                const { name, point } = anchorPoint;
                const size = MARKER_SIZE * scale * 3;
                const data =
                    `M ${point.x} ${point.y - size} `
                    + `C ${point.x} ${point.y - size * 1 / 3} ${point.x + size * 1 / 3} ${point.y} ${point.x + size} ${point.y} `
                    + `C ${point.x + size * 1 / 3} ${point.y} ${point.x} ${point.y + size * 1 / 3} ${point.x} ${point.y + size} `
                    + `C ${point.x} ${point.y + size * 1 / 3} ${point.x - size * 1 / 3} ${point.y} ${point.x - size} ${point.y} `
                    + `C ${point.x - size * 1 / 3} ${point.y} ${point.x} ${point.y - size * 1 / 3} ${point.x} ${point.y - size} `
                    + "Z";
                const nameOffsetX = point.x;
                const fontSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--default-font-size').replace("px", ""));
                const nameOffsetY = point.y + size + (fontSize / 4) * scale;
                return (
                    <g key={name} className="glyph-anchor-point-component">
                        <path
                            className="anchor-point"
                            d={data}
                            fill="currentColor"
                            stroke="currentColor"
                            strokeWidth={scale}
                        />
                        <g
                            className="anchor-point-name"
                            transform={`translate(${nameOffsetX}, ${nameOffsetY}), scale(1, -1)`}
                        >
                            <text x={0} y={0} textAnchor="middle" style={{fontSize: `calc(var(--default-font-size) * ${scale})`}}>{name}</text>
                        </g>
                    </g>
                );
            })}
        </g>
    );
}
