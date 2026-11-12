import { P as PGliteInterface } from '../interface-ymvJB3xs.cjs';

declare const pg_walinspect: {
    name: string;
    setup: (_pg: PGliteInterface, _emscriptenOpts: any) => Promise<{
        bundlePath: URL;
    }>;
};

export { pg_walinspect };
