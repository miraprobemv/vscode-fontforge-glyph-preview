import React, { useMemo } from "react";
import { CombPart } from "../../libs/glyph";

type Props = {
    combParts: CombPart[];
    scale: number;
};
export default function SvgGlyphCurvatureComb({
    combParts,
    scale,
}: Props) {
    const dataList = useMemo(() => {
        const dataList = combParts.map(p => {
            const combEnds = p.combs.filter(c => !(isNaN(c.end.x) || isNaN(c.end.y))).map(c => `L ${c.end.x} ${c.end.y}`)
            const data = `M ${p.curve.point.x} ${p.curve.point.y} C ${p.curve.controlPoints[1].x} ${p.curve.controlPoints[1].y} ${p.curve.controlPoints[0].x} ${p.curve.controlPoints[0].y} ${p.start.x} ${p.start.y} ` + combEnds.join(" ") + " Z";
            return data;
        });
        return dataList;
    }, [combParts]);

    return (
        <g className="glyph-curvature-comb">
            {dataList.map((data, idx) => (
                <path key={idx}
                    className="curvature-comb"
                    d={data}
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth={scale}
                />)
            )}
        </g>
    );  
}
