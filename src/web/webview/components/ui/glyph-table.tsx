import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GlyphEncoding } from "../../libs/sfd";
import { enumerate } from "../../../common/util";
import GlyphPreview from "../glyph/glyph-preview";
import { useGlyphStore } from "../../hooks/glyph-store";
import { addMargineToViewBox, affineTransformViewBox, estimateViewBox, GlyphData, mergeViewBox } from "../../libs/glyph";
import { ViewBox } from "../../libs/metrics";

type GlyphCell = {
    codepoint: number;
    name: string;
    lower: number;
    gid: number;
    glyphData: GlyphData;
    centerOffset: number;
}

type GlyphsRow = {
    upper: number;
    cells: (GlyphCell | undefined)[]
    hasGap: boolean;
}

type Props = {
    nameToEncodingList: [name: string, encoding: GlyphEncoding][];
    displayType: string;
    onClose: () => void;
    onItemSelected: (name: string, gid: number) => void;
};
export default function GLyphTable({
    nameToEncodingList,
    displayType,
    onClose,
    onItemSelected: onItemClick,

}: Props) {
    const glyphStore = useGlyphStore();

    const [viewBox, setViewBox] = useState<ViewBox>([0, 0, 0, 0]);

    const createNewRow = (upper: number, hasGap: boolean): GlyphsRow => {
        const row = {
            upper,
            cells: [
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            ],
            hasGap,
        };
        return row;
    } 

    const [tableData, setTableData] = useState<GlyphsRow[]>([]);
    useEffect(() => {
        const setTableDataAsync = async () => {
            if (nameToEncodingList.length === 0) {
                setTableData([]);
                return;
            }

            let data: GlyphsRow[] = [];
            let shredViewBox: ViewBox = [0, 0, 0, 0];
            const source = nameToEncodingList.map(
                ([name, encoding]) => [encoding.codepoint, name, encoding.gid] as [number, string, number]
            ).sort(
                (a, b) => (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? +1 : 0
            );
            const firstUpper = Math.floor(source[0][0] / 16);
            let row = createNewRow(firstUpper, firstUpper !== 0);
            for (const [codepoint, name, gid] of source) {
                const upper = Math.floor(codepoint / 16);
                const lower = codepoint % 16;
                const glyphData = await glyphStore.getGlyphDataAsync(gid);
                if (!glyphData) { continue; }

                const viewBox = estimateViewBox(glyphData);
                const [x, _, width, __] = viewBox;
                const centerOffset = x + width / 2;
                shredViewBox = mergeViewBox(
                    shredViewBox,
                    affineTransformViewBox(viewBox, [1, 0, 0, 1, -centerOffset, 0])
                );
                if (row.upper !== upper) {
                    data.push(row);
                    row = createNewRow(upper, (upper - row.upper >= 2));
                }
                row.cells[lower] = {
                    codepoint,
                    name,
                    lower,
                    gid,
                    glyphData,
                    centerOffset,
                };
            }
            data.push(row);

            console.log(`Shared view box: ${shredViewBox}`);
            setTableData(data);
            setViewBox(addMargineToViewBox(shredViewBox, 0.1));
            // setViewBox(shredViewBox);
        };
        setTableDataAsync();
    }, [nameToEncodingList, glyphStore]);

    const handleOnClick = useCallback((name: string, gid: number) => {
        onClose();
        onItemClick(name, gid);
    }, [onClose, onItemClick]);
    
    return (
        <aside className="glyph-table-contailner">
            <table className="glyph-table">
                <thead>
                    <tr>
                        <th className="glyph-table--by"></th>
                        {enumerate(0, 16).map(lower => {
                            return (<th key={`glyph-table--header--lower-${lower}`} className="glyph-table--column">{lower.toString(16).toUpperCase()}</th>);
                        })}
                    </tr>
                </thead>
                <tbody>
                    {tableData.map((row) => {
                        return (
                            <React.Fragment key={row.upper}>
                                {row.hasGap &&(
                                    <tr className="glyph-table--row _gap">
                                        <th className="glyph-table--row--header">...</th>
                                        {enumerate(0, 16).map(lower => {
                                            return (<td key={`glyph-table--gap-${row.upper}-${lower}`} className="glyph-table--cell _no-glyph-data"></td>);
                                        })}
                                    </tr>
                                )}
                                <tr className="glyph-table--row">
                                    <th className="glyph-table--row--header">U+{row.upper.toString(16).padStart(4,"0").toUpperCase()}</th>
                                    {row.cells.map((cell, idx) => {
                                        return cell ? (
                                            <td key={`${row.upper}-${idx}`} className="glyph-table--cell" title={cell.name} onClick={() => {handleOnClick(cell.name, cell.gid)}}>
                                                <label className="glyph-table--cell--name">{cell.name}</label>
                                                <div className="glyph-table--cell--image">
                                                    <GlyphPreview displayType={displayType} glyphData={cell.glyphData} viewBox={viewBox} centerOffset={cell.centerOffset} />
                                                </div>
                                            </td>
                                        ) : (
                                            <td key={`${row.upper}-${idx}`} className="glyph-table--cell _no-glyph-data">
                                            </td>
                                        );
                                    })}
                                </tr>
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </aside>
    );
}
