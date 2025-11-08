import React, { useMemo, useRef, useState, useEffect } from "react";
import SvgGlyphAxis from "./svg-glyph-axis";
import SvgGlyphPath from "./svg-glyph-path";
import SvgGlyphHandle from "./svg-glyph-handle";
import SvgGlyphPoint from "./svg-glyph-point";
import SvgGlyphRefer from "./svg-glyph-refer";
import SvgGlyphCurvatureComb from "./svg-glyph-curvature-comb";
import { calcCurvatureCombs, calcHandles, GlyphData } from "../../libs/glyph";
import { estimateViewBox, estimateReferViewBox, mergeViewBox, addMargineToViewBox } from "../../libs/glyph";
import { PreviewSettings } from "../../../common/types";


type Props = {
    glyphData: GlyphData;
    settings: PreviewSettings;
};
export default function GlyphOutline({
    glyphData,
    settings,
}: Props) {
    
    const viewBox = useMemo(() => {
        let viewBox = estimateViewBox(glyphData.width, glyphData.paths);
        if (glyphData.refers.length > 0) {
            const referViewBox = estimateReferViewBox(glyphData.refers);
            viewBox = mergeViewBox(viewBox, referViewBox);
        }
        viewBox = addMargineToViewBox(viewBox, 0.2);
        return viewBox;
    }, [glyphData]);

    const [minX, minY, width, height] = viewBox;
    
    const svgElement = useRef<SVGSVGElement | null>(null);

    const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const svg = svgElement.current;
        if (!svg) { return; }

        // initial measurement
        const initial = svg.getBoundingClientRect();
        setSvgSize({ width: (initial.width || svg.clientWidth || 0), height: (initial.height || svg.clientHeight || 0) });

        // update on resize using ResizeObserver
        const ovserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) { return; }
            const current = entry.contentRect;
            setSvgSize({ width: current.width, height: current.height });
        });
        ovserver.observe(svg);

        return () => ovserver.disconnect();
    }, [svgElement]);

    const scale = useMemo(() => {
        if ((svgSize.width > 0 && svgSize.height > 0) && (width > 0 || height > 0)) {
            return  Math.max(width / svgSize.width, height / svgSize.height);
        } else {
            return 1;
        }
    }, [svgSize, width, height]);

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
                    {settings.displayType === "metrics" && <SvgGlyphAxis viewBox={viewBox} width={glyphData.width} scale={scale} />}
                    {glyphData.refers.map((refer, idx) => {
                        return (<SvgGlyphRefer key={idx} refer={refer} scale={scale} className={(settings.displayType === "metrics") ? "refer-glyph-path" : "glyph-preview"} />);
                    })}
                    {(settings.displayType === "metrics" && settings.showsCurvatureCombs) && <SvgGlyphCurvatureComb combs={calcCurvatureCombs(glyphData.paths, scale)} scale={scale} />}
                    <SvgGlyphPath paths={glyphData.paths} scale={scale} className={(settings.displayType === "metrics") ? "glyph-path" : "glyph-preview"} />
                    {settings.displayType === "metrics" && <SvgGlyphHandle handles={calcHandles(glyphData.paths)} scale={scale} />}
                    {settings.displayType === "metrics" && <SvgGlyphPoint points={glyphData.paths.filter(x => x.type !== "M")} scale={scale} />}
                </g>
            </svg>
        </div>
    );
}
