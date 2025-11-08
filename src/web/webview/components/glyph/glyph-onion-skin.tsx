import React, { useMemo, useRef, useState, useEffect } from "react";
import SvgGlyphPath from "./svg-glyph-path";
import SvgGlyphRefer from "./svg-glyph-refer";
import { affineTransformPath, flattenGlyphPath, GlyphData, interpolatePaths } from "../../libs/glyph";
import { estimateGlyphViewBox, mergeViewBox, addMargineToViewBox } from "../../libs/glyph";
import { PreviewSettings } from "../../../common/types";
import { enumerate, zip } from "../../../common/util";
import SvgGlyphSolidImage from "./svg-glyph-solid-image";


type Props = {
    glyphData: [GlyphData, GlyphData];
    settings: PreviewSettings;
};
export default function GlyphOnionSkin({
    glyphData,
}: Props) {
    
    const { viewBox, glyphPaths } = useMemo(() => {
        
        const viewBox0 = estimateGlyphViewBox(glyphData[0]);
        const viewBox1 = estimateGlyphViewBox(glyphData[1]);
        let viewBox = mergeViewBox(
            viewBox0,
            viewBox1,
        );
        viewBox = addMargineToViewBox(viewBox, 0.2);
        const center0 = viewBox0[0] + viewBox0[2] / 2;
        const center1 = viewBox1[0] + viewBox1[2] / 2;
        let shift0;
        let shift1;
        if (center0 <= center1) {
            shift0 = center1 - center0;
            shift1 = 0;
        } else {
            shift0 = 0;
            shift1 = center0 - center1;
        }
        const path0 = flattenGlyphPath(glyphData[0]).map(op => affineTransformPath(op,[ 1, 0, 0, 1, shift0, 0]));
        const path1 = flattenGlyphPath(glyphData[1]).map(op => affineTransformPath(op,[ 1, 0, 0, 1, shift1, 0]));
        return { viewBox, glyphPaths: [path0, path1] };
    }, [glyphData]);

    const [minX, minY, width, height] = viewBox;
    
    const svgElement = useRef<SVGSVGElement | null>(null);

    const steps = 7;
    const opacity = 1.0 / steps;
    return (
        <div className="glyph-image glyph-outline">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="glyph-svg"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                ref={svgElement}
            >
                <g transform={`translate(0, ${minY}), scale(1, -1), translate(${-minX}, ${-height})`}>
                    <SvgGlyphSolidImage id="glyph0" paths={glyphPaths[0]} viewBox={viewBox} className="glyph-preview" opacity={opacity} />
                    { enumerate(1, steps + 1).map(i => {
                        const ratio = i / (steps + 1);
                        const stepPaths = interpolatePaths(glyphPaths[0], ratio, glyphPaths[1]);
                        return (
                            <SvgGlyphSolidImage id={`glyphinterpolate-${i}`} key={i} paths={stepPaths} viewBox={viewBox} className="glyph-preview" opacity={opacity} />
                        );
                    }) }
                    <SvgGlyphSolidImage id="glyph1" paths={glyphPaths[1]} viewBox={viewBox} className="glyph-preview" opacity={opacity} />
                </g>
            </svg>
        </div>
    );
}
