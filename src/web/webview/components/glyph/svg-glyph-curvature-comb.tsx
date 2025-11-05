import React, { useMemo } from "react";
import { Comb } from "../../libs/glyph";

type Props = {
    combs: Comb[];
    scale: number;
};
export default function SvgGlyphCurvatureComb({
    combs,
    scale,
}: Props) {
    const data = useMemo(() => {
        const pathDataList = combs.map(c => `M ${c.root.x} ${c.root.y} L ${c.end.x} ${c.end.y}`);
        const data = pathDataList.join(" ");
        return data;
    }, [combs]);

    return (
        <path
            className="curvature-comb"
            d={data}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={scale} />
    );  
}
