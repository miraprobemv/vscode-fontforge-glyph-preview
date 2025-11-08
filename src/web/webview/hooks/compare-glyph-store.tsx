import React from "react";
import { GlyphStore } from "../libs/glyph-store";

const GlyphStoreContext = React.createContext<[GlyphStore, GlyphStore] | null>(null);

export function CompareGlyphStoreProvider({ children }: { children: React.ReactNode }) {
    const ref = React.useRef<[GlyphStore, GlyphStore] | null>(null);
    if (!ref.current) {
        ref.current = [new GlyphStore(), new GlyphStore()];
    }

    React.useEffect(() => {
        return () => {
            try {
                if (ref.current) {
                    for (const store of ref.current) {
                        store.dispose();
                    }
                }
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

export function useGlyphStores(): [GlyphStore, GlyphStore] {
    const ctx = React.useContext(GlyphStoreContext);
    if (!ctx) {
        throw new Error("useGlyphStores must be used within a CompareGlyphStoreProvider");
    }
    return ctx;
}