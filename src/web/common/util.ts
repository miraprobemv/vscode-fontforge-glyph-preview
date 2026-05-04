
export function zip<T1, T2>(list1: T1[], list2: T2[]): [T1, T2][] {
    const length =  Math.min(list1.length, list2.length);
    const result: [T1, T2][] = [];
    for (let i = 0; i < length; i++) {
        result.push([list1[i], list2[i]]);
    }
    return result;
}
;

export function mapTuple<T, TR>(source: [T], f: (value: T, index: number, array: T[]) => TR): [TR];
export function mapTuple<T, TR>(source: [T, T], f: (value: T, index: number, array: T[]) => TR): [TR, TR];
export function mapTuple<T, TR>(source: T[], f: (value: T, index: number, array: T[]) => TR): TR[] {
    return source.map(f);
}

export function enumerate(start: number, end: number): number[] {
    const ns: number[] = [];
    for (let i = start; i < end; i++) {
        ns.push(i);
    }
    return ns;
}
