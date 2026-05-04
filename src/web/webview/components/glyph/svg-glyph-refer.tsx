import React from "react";
import SvgAffineTransform from "./svg-affine-transform";
import SvgGlyphPath from "./svg-glyph-path";
import { GlyphRefer } from "../../libs/glyph";


type Props = {
    refer: GlyphRefer;
    scale: number;
    className: string;
};
export default function SvgGlyphRefer({
    refer,
    scale,
    className,
}: Props) {
    return (
        <SvgAffineTransform className="glyph-refer" param={refer.affineParam}>
            {refer.refers.map((referOfRefer, idx) => {
                return <SvgGlyphRefer key={idx} refer={referOfRefer} scale={scale} className={className} />;
            })}
            {refer.glyphPaths && <SvgGlyphPath paths={refer.glyphPaths} scale={scale} className={className} />}
        </SvgAffineTransform>
    );
}
