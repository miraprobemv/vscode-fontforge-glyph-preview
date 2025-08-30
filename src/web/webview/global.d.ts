import { VSCodeApi } from './vscodeapi';

declare global {
    export const acquireVsCodeApi: () => VSCodeApi;
}
