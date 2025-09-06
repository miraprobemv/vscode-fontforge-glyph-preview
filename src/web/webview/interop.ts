import { VSCodeApi } from "./vscodeapi";

export function postMessage(
    receiver: VSCodeApi,
    message: string,
    params: any = {},
) {
    receiver.postMessage({
        type: message,
        params: params,
    });
}

type ReturnMessage = {
    type: string;
    callbackId: string;
    result?: any;
    error?: any;
}

export function sendMessageAsync(
    receiver: VSCodeApi,
    message: string,
    params: any = {},
): Promise<any> {
    return new Promise((resolve, reject) => {
        const callbackId = Math.random().toString(36).substring(2, 15);
        function handleMessage(event: MessageEvent<ReturnMessage>) {
            if (
                event.data.type === "[return]" &&
                event.data.callbackId === callbackId
            ) {
                window.removeEventListener("message", handleMessage);
                if (event.data.result) {
                    resolve(event.data.result);
                } else {
                    reject(new Error(event.data.error));
                }
            }
        }
        window.addEventListener("message", handleMessage);
        receiver.postMessage({
            type: message,
            params: params,
            callbackId: callbackId,
        });
    });
}
