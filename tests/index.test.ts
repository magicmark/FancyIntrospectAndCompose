import { jest } from '@jest/globals';
import { ApolloServer } from '@apollo/server';
import { ApolloGateway } from '@apollo/gateway';
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';

import startSubgraph from '../testing/subgraph';
import FancyIntrospectAndCompose from '../src';

it('modify schema mutates the schema', async () => {
    const fooSubgraph = await startSubgraph('Foo');
    const barSubgraph = await startSubgraph('Bar');

    const getDirectiveName = jest.fn<() => string>();
    getDirectiveName.mockReturnValue('@foo');

    const gateway = new ApolloGateway({
        supergraphSdl: new FancyIntrospectAndCompose({
            pollIntervalInMs: 100, // poll every 5 seconds (we'll use jest timers to advance)
            modifySchema: sdl => {
                return `directive ${getDirectiveName()} on QUERY\n${sdl}`;
            },
            subgraphs: [
                {
                    name: 'subgraph_foo',
                    url: urlJoin(fooSubgraph.url, '/graphql'),
                },
                {
                    name: 'subgraph_bar',
                    url: urlJoin(barSubgraph.url, '/graphql'),
                },
            ],
            staticSubgraphs: [],
        }),
    });

    const gatewayServer = new ApolloServer({ gateway });
    const getDirectivesFromIntrospection = async () => {
        const response = await gatewayServer.executeOperation({
            query: /* GraphQL */ `
                query IntrospectionQuery {
                    __schema {
                        directives {
                            name
                        }
                    }
                }
            `,
        });

        // @ts-ignore: todo: properly unwrap/typecheck this
        return response.body.singleResult.data.__schema.directives;
    };

    await expect(getDirectivesFromIntrospection()).resolves.toContainEqual({ name: 'foo' });

    getDirectiveName.mockReturnValue('@bar');
    await fooSubgraph.respawn();

    await waitForExpect(async () => {
        await expect(getDirectivesFromIntrospection()).resolves.toContainEqual({ name: 'bar' });
    });

    await fooSubgraph.stopServer();
    await barSubgraph.stopServer();
    await gatewayServer.stop();
});

it('can provide static subgraphs', async () => {
    const fooSubgraph = await startSubgraph('Foo');
    const barSubgraph = await startSubgraph('Bar');
    const bazSubgraph = await startSubgraph('Baz');
    const quxSubgraph = await startSubgraph('Qux');

    const getFakeSDL = (typeName: string) => /* GraphQL */ `
        type Query {
            _service: _Service!
        }

        type ${typeName} {
            subgraphHasBeenOverriden: String
        }

        type _Service {
            sdl: String
        }
    `;

    const gateway = new ApolloGateway({
        supergraphSdl: new FancyIntrospectAndCompose({
            subgraphs: [
                {
                    name: 'subgraph_foo',
                    url: urlJoin(fooSubgraph.url, '/graphql'),
                },
            ],
            staticSubgraphs: [
                {
                    name: 'subgraph_bar',
                    sdl: getFakeSDL('Bar'),
                },
                {
                    name: 'subgraph_baz',
                    sdl: () => getFakeSDL('Baz'),
                },
                {
                    name: 'subgraph_qux',
                    sdl: () =>
                        new Promise(resolve => {
                            setImmediate(() => {
                                resolve(getFakeSDL('Qux'));
                            });
                        }),
                },
            ],
        }),
    });

    const gatewayServer = new ApolloServer({ gateway });
    const getTypesFromIntrospection = async () => {
        const response = await gatewayServer.executeOperation({
            query: /* GraphQL */ `
                query IntrospectionQuery {
                    __schema {
                        types {
                            name
                            fields {
                                name
                            }
                        }
                    }
                }
            `,
        });

        // @ts-ignore: todo: properly unwrap/typecheck this
        return response.body.singleResult.data.__schema.types;
    };

    await expect(getTypesFromIntrospection()).resolves.not.toContainEqual({
        name: 'Foo',
        fields: [
            {
                name: 'subgraphHasBeenOverriden',
            },
        ],
    });

    await expect(getTypesFromIntrospection()).resolves.toContainEqual({
        name: 'Bar',
        fields: [
            {
                name: 'subgraphHasBeenOverriden',
            },
        ],
    });

    await expect(getTypesFromIntrospection()).resolves.toContainEqual({
        name: 'Baz',
        fields: [
            {
                name: 'subgraphHasBeenOverriden',
            },
        ],
    });

    await expect(getTypesFromIntrospection()).resolves.toContainEqual({
        name: 'Qux',
        fields: [
            {
                name: 'subgraphHasBeenOverriden',
            },
        ],
    });

    await fooSubgraph.stopServer();
    await barSubgraph.stopServer();
    await bazSubgraph.stopServer();
    await quxSubgraph.stopServer();
    await gatewayServer.stop();
});
