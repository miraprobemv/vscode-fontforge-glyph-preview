import React from "react";


export function Loading() {
    return (
        <div className="loading-overlay" aria-hidden="true">
            <div className="loading">
                <span className="loading-text">Loading</span>
                <span className="dots" aria-hidden="true">
                    <span></span><span></span><span></span>
                </span>
            </div>
        </div>
    );
}
