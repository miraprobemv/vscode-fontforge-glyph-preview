import React, { useMemo, useRef } from "react";
import SvgGlyphPath from "./svg-glyph-path";
import SvgGlyphRefer from "./svg-glyph-refer";
import { addMargineToViewBox, estimateViewBox, GlyphData } from "../../libs/glyph";
import { ViewBox } from "../../libs/metrics";
import SvgAffineTransform from "./svg-affine-transform";


type Props = {
    displayType: string;
    glyphData: GlyphData;
    viewBox?: ViewBox;
    centerOffset?: number;
};
export default function GlyphPreview({
    displayType,
    glyphData,
    viewBox,
    centerOffset,
}: Props) {
    const calculatedCenterOffset = centerOffset ?? 0;
    const calculatedViewBox = useMemo(() => {
        if (viewBox) { return viewBox; }

        let calculatedViewBox =  addMargineToViewBox(estimateViewBox(glyphData), 0.2);
        return calculatedViewBox;
    }, [viewBox, glyphData]);

    const [minX, minY, width, height] = calculatedViewBox;
    
    const svgElement = useRef<SVGSVGElement | null>(null);

    return (
        <div className="glyph-image glyph-preview">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="glyph-svg"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                ref={svgElement}
            >
                <g transform={`translate(0, ${minY}), scale(1, -1), translate(${-minX}, ${-height})`}>
                    <SvgAffineTransform param={[1, 0, 0, 1, -calculatedCenterOffset, 0]}>
                        {glyphData.refers.map((refer, idx) => {
                            return (<SvgGlyphRefer key={idx} refer={refer} scale={1} className={(displayType === "metrics") ? "refer-glyph-preview": "glyph-preview"} />);
                        })}
                        <SvgGlyphPath paths={glyphData.paths} scale={1} className="glyph-preview" />
                    </SvgAffineTransform>
                </g>
            </svg>
        </div>
    );
}
