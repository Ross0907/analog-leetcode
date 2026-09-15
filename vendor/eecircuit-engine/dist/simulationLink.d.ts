import { ResultType } from './readOutput.ts';
export declare class Simulation {
    private static readonly MAX_INFO_CHARS;
    __getSpiceModuleForTests(): object | null;
    private pass;
    private commandList;
    private isNoiseMode;
    private cmd;
    private dataRaw;
    private results;
    private output;
    private info;
    private initInfo;
    private error;
    private initialized;
    private spiceModule;
    private startPromise;
    private netList;
    private initPromiseResolve;
    private runPromiseResolve;
    private continuePromiseResolve;
    private getInput;
    /**
     * Internal startup method that sets up the Module and simulation loop.
     */
    private startInternal;
    /**
     * Public start method.
     * Returns a promise that resolves when the simulation module is initialized.
     */
    start: () => Promise<void>;
    /**
     * Triggers a simulation run and returns a promise that resolves with the results.
     */
    runSim: () => Promise<ResultType>;
    /**
     * Waits for a new simulation trigger.
     */
    private waitForNextRun;
    /**
     * Resolves the waiting promise to continue the simulation loop.
     */
    private continueRun;
    private outputEvent;
    setNetList: (input: string) => void;
    private setOutputEvent;
    getInfo: () => string;
    getInitInfo: () => string;
    getError: () => string[];
    isInitialized: () => boolean;
    private log_debug;
}
