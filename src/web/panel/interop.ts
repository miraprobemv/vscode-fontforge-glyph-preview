import * as vscode from "vscode";

export function postMessage(
    panel: vscode.WebviewPanel,
    messageType: string,
    params: any,
) {
    panel.webview.postMessage({
        type: messageType,
        params: params,
    });
}

type MessageObject = {
    type: string;
    params: any;
    callbackId: string;
};

export async function returnMessageAsync(
    panel: vscode.WebviewPanel,
    message: MessageObject,
    func: (params: any) => any,
) {
    try {
        const value = func(message.params);
        if (isPromise(value)) {
            panel.webview.postMessage({
                type: "[return]",
                callbackId: message.callbackId,
                result: await value,
            });
        } else {
            panel.webview.postMessage({
                type: "[return]",
                callbackId: message.callbackId,
                result: value,
            });
        }
    } catch (error: any) {
        panel.webview.postMessage({
            type: "[return]",
            callbackId: message.callbackId,
            error: error.message,
        });
    }
}

function isPromise(value: any) {
    return (
        value !== null
        && typeof value === "object"
        && typeof value.then === "function"
        && typeof value.catch === "function"
    );
}
