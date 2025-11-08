import React from "react";
import { AffineParam } from "../../libs/metrics";


type Props = {
    className?: string;
    param: AffineParam;
    children: React.ReactNode;
};
export default function SvgAffineTransform({
    className,
    param,
    children,
}: Props) {
    const [a, b, c, d, e, f] = param;

    return (
        <g className={className} transform={`matrix(${a} ${b} ${c} ${d} ${e} ${f})`}>
            {children}
        </g>
    );
}
