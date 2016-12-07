declare module "spawn-rx" {
    namespace spawnrx {
        function findActualExecutable(exe: string, args?: Array<string> | undefined): { cmd: string, args: Array<string> };
        function spawnDetachedPromise(exe: string, params?: Array<string> | undefined, opts?: Object | undefined): Promise<string>;
        function spawnPromise(exe: string, params?: Array<string> | undefined, opts?: Object | undefined): Promise<string>;
    }
    export = spawnrx;
}