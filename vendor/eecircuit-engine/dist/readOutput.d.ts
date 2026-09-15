/**
 * Read output from spice
 */
export type VariableType = {
    name: string;
    type: "voltage" | "current" | "time" | "frequency" | "notype";
};
export type RealDataType = {
    name: string;
    type: VariableType["type"];
    values: RealNumber[];
};
export type ComplexDataType = {
    name: string;
    type: VariableType["type"];
    values: ComplexNumber[];
};
export type ResultType = {
    header: string;
    numVariables: number;
    variableNames: string[];
    numPoints: number;
    dataType: "real";
    data: RealDataType[];
} | {
    header: string;
    numVariables: number;
    variableNames: string[];
    numPoints: number;
    dataType: "complex";
    data: ComplexDataType[];
};
type RawResultType = {
    param: ParamType;
    header: string;
    data: RealNumber[][] | ComplexNumber[][];
};
type ParamType = {
    varNum: number;
    pointNum: number;
    variables: VariableType[];
    dataType: "real" | "complex";
};
export type RealNumber = number;
export type ComplexNumber = {
    real: number;
    img: number;
};
export declare function readRawOutput(rawData: Uint8Array): RawResultType;
export declare function readOutput(output: Uint8Array): ResultType;
export {};
