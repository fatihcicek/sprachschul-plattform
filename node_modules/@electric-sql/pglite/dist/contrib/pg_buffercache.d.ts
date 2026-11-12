import { P as PGliteInterface } from '../interface-ymvJB3xs.js';

declare const pg_buffercache: {
    name: string;
    setup: (_pg: PGliteInterface, _emscriptenOpts: any) => Promise<{
        bundlePath: URL;
    }>;
};

export { pg_buffercache };
