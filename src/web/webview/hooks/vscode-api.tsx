import React from "react";
import { VSCodeApi } from "../types/vscodeapi";

const VscodeApiContext = React.createContext<VSCodeApi | null>(null);

export function VscodeProvider(
    { vscodeApi, children }: { vscodeApi: VSCodeApi; children: React.ReactNode }
) {
    const ref = React.useRef<VSCodeApi | null>(null);
    if (!ref.current) {
        ref.current = vscodeApi;
    }
    return (
        <VscodeApiContext.Provider value={ref.current}>
            {children}
        </VscodeApiContext.Provider>
    );
}

export function useVscodeApi(): VSCodeApi {
    const ctx = React.useContext(VscodeApiContext);
    if (!ctx) {
        throw new Error("useVscodeApi must be used within a VscodeProvider");
    }
    return ctx;
}