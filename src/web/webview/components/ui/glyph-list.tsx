import React, { useCallback } from "react";

type Props = {
    nameToGidList: [name: string, gid: number][];
    open: boolean;
    onClose: () => void;
    onItemSelected: (name: string, gid: number) => void;
};
export default function GLyphList({
    nameToGidList,
    open,
    onClose,
    onItemSelected: onItemClick,

}: Props) {

    const handleOnClick = useCallback((name: string, gid: number) => {
        onClose();
        onItemClick(name, gid);
    }, [onClose, onItemClick]);
    
    return (
        <aside className={"side-menu " + ((open && (nameToGidList.length >= 2)) ? "" : "_closed")}>
            <div className="glyph-list-container">
                <ul>
                    {nameToGidList.map(([name, gid]) => {
                        return (
                            <li key={name} onClick={_ => handleOnClick(name, gid)}>{name}</li>
                        );
                    })}
                </ul>
            </div>
        </aside>
    );
}
