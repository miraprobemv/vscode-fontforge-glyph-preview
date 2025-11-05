import React from "react";
import { GlyphStore } from "../libs/glyph-store";

const GlyphStoreContext = React.createContext<GlyphStore | null>(null);

export function GlyphStoreProvider({ children }: { children: React.ReactNode }) {
    const ref = React.useRef<GlyphStore | null>(null);
    if (!ref.current) {
        ref.current = new GlyphStore();
    }

    React.useEffect(() => {
        return () => {
            try {
                ref.current?.dispose();
            } finally {
                ref.current = null;
            }
        };
    }, []);

    return (
        <GlyphStoreContext.Provider value={ref.current}>
            {children}
        </GlyphStoreContext.Provider>
    );
}

export function useGlyphStore(): GlyphStore {
    const ctx = React.useContext(GlyphStoreContext);
    if (!ctx) {
        throw new Error("useGlyphStore must be used within a GlyphStoreProvider");
    }
    return ctx;
}