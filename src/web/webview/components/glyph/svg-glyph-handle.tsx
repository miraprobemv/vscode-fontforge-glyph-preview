import React from "react";
import { nearlyEqual } from "../../libs/metrics";
import { PathHandle } from "../../libs/glyph";
import { MARKER_SIZE } from "../../libs/glyph";

type Props = {
    handles: PathHandle[];
    scale: number;
};
export default function SvgGlyphHandle({
    handles,
    scale,
}: Props) {

    return (
        <g className="glyph-handle-group">
            {handles.map((pathHandle, idx) => {
                const { root: { x: x1, y: y1 }, end: { x: x2, y: y2 }, forward } = pathHandle;
                if (nearlyEqual(x1, x2) && nearlyEqual(y1, y2)) {
                    return null;
                }

                const className = forward ? "glyph-forward-handle" : "glyph-backward-handle";

                const radius = MARKER_SIZE * scale;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const dxShortened = dx * (length - radius) / length;
                const dyShortened = dy * (length - radius) / length;
                return (
                    <React.Fragment key={idx}>
                        <line
                            className={className}
                            x1={x1}
                            y1={y1}
                            x2={x1 + dxShortened}
                            y2={y1 + dyShortened}
                            stroke="currentColor"
                            strokeWidth={scale} />
                        <circle
                            className={className}
                            cx={x2}
                            cy={y2}
                            r={radius}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={scale} />
                    </React.Fragment>
                );
            })}
        </g>
    );
}
