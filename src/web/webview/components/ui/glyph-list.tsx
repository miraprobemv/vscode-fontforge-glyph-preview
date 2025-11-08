import React, { useCallback } from "react";
import { GlyphEncoding } from "../../libs/sfd";

type Props = {
    nameToEncodingList: [name: string, encoding: GlyphEncoding][];
    open: boolean;
    onClose: () => void;
    onItemSelected: (name: string, gid: number) => void;
};
export default function GLyphList({
    nameToEncodingList,
    open,
    onClose,
    onItemSelected: onItemClick,

}: Props) {

    const handleOnClick = useCallback((name: string, gid: number) => {
        onClose();
        onItemClick(name, gid);
    }, [onClose, onItemClick]);
    
    return (
        <aside className={"side-menu " + ((open && (nameToEncodingList.length >= 2)) ? "" : "_closed")}>
            <div className="glyph-list-container">
                <ul>
                    {nameToEncodingList.map(([name, {gid}]) => {
                        return (
                            <li key={name} onClick={_ => handleOnClick(name, gid)}>{name}</li>
                        );
                    })}
                </ul>
            </div>
        </aside>
    );
}
