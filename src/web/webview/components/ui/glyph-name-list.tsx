import React, { useCallback } from "react";

type Props = {
    nameList: string[];
    open: boolean;
    onClose: () => void;
    onItemSelected: (name: string) => void;
};
export default function GLyphNameList({
    nameList,
    open,
    onClose,
    onItemSelected: onItemClick,

}: Props) {

    const handleOnClick = useCallback((name: string) => {
        onClose();
        onItemClick(name);
    }, [onClose, onItemClick]);
    
    return (
        <aside className={"side-menu " + ((open && (nameList.length >= 2)) ? "" : "_closed")}>
            <div className="glyph-list-container">
                <ul>
                    {nameList.map((name) => {
                        return (
                            <li key={name} onClick={_ => handleOnClick(name)}>{name}</li>
                        );
                    })}
                </ul>
            </div>
        </aside>
    );
}
