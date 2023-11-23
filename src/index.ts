import assert from 'node:assert';
import { IntrospectAndCompose, GetDataSourceFunction, SupergraphSdlUpdateFunction } from '@apollo/gateway';
import { IntrospectAndComposeOptions } from '@apollo/gateway/dist/supergraphManagers/IntrospectAndCompose';
import { SupergraphSdlHookOptions } from '@apollo/gateway/dist/config.js';

export interface FancyIntrospectAndComposeOptions extends IntrospectAndComposeOptions {
    modifySchema?: (sdl: string) => string;
    staticSubgraphs: Array<{ name: string; sdl: string | (() => string) | (() => Promise<string>) }>;
}

export default class FancyIntrospectAndCompose extends IntrospectAndCompose {
    private modifySchema: (sdl: string) => string;
    private staticSubgraphs: Array<{ name: string; sdl: string | (() => string) | (() => Promise<string>) }>;

    constructor(options: FancyIntrospectAndComposeOptions) {
        const { subgraphs, staticSubgraphs, modifySchema, ...introspectAndComposeOptions } = options;

        super({
            ...introspectAndComposeOptions,
            subgraphs: [
                ...subgraphs,
                ...staticSubgraphs.map(subgraph => {
                    return {
                        name: subgraph.name,
                        url: 'http://static.subgraph',
                    };
                }),
            ],
        });

        this.modifySchema = modifySchema ?? (sdl => sdl);
        this.staticSubgraphs = staticSubgraphs;
    }

    public override async initialize({ update, getDataSource, ...initializeArgs }: SupergraphSdlHookOptions) {
        const _getDataSource: GetDataSourceFunction = ({ name, url }) => {
            if (url !== 'http://static.subgraph') {
                assert(url != null, 'url must be defined as a parameter in the subgraphs array');
                return getDataSource({ name, url });
            }

            const staticSubgraph = this.staticSubgraphs.find(subgraph => subgraph.name === name);
            assert(staticSubgraph != null, 'static subgraph must exist'); // sanity check for typescript

            const { sdl } = staticSubgraph;
            const sdlGetter = typeof sdl === 'function' ? sdl : () => sdl;

            return {
                process: () => {
                    return Promise.resolve(sdlGetter()).then(_sdl => ({
                        data: {
                            _service: {
                                sdl: _sdl,
                            },
                        },
                    }));
                },
            };
        };

        const _update: SupergraphSdlUpdateFunction = sdl => {
            return update(this.modifySchema(sdl));
        };

        const { supergraphSdl, cleanup } = await super.initialize({
            ...initializeArgs,
            update: _update,
            getDataSource: _getDataSource,
        });

        return {
            supergraphSdl: this.modifySchema(supergraphSdl),
            cleanup,
        };
    }
}
