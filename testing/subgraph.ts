import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { ApolloServer } from '@apollo/server';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { startStandaloneServer } from '@apollo/server/standalone';

import { ApolloServerPluginInlineTraceDisabled } from '@apollo/server/plugin/disabled';
import gql from 'graphql-tag';
import getPort from 'get-port';

type TypeName = 'Foo' | 'Bar' | 'Baz' | 'Qux';

export default async function startSubgraph(name: TypeName) {
    const port = await getPort();
    let currentServer: ApolloServer | null;

    async function spawnServer() {
        // make sure each subgraph has a unique schema on each spawn, so the gateway triggers a re-composition
        const token = randomUUID().split('-')[0];

        const typeDefs = gql`
            type Query {
                randomField_${token}: String
            }

            type ${name} {
                ${name.toLowerCase()}: String
            }
        `;

        const resolvers = {
            [name]: { [name.toLowerCase()]: name.toLowerCase() },
        };

        const schema = buildSubgraphSchema({ typeDefs, resolvers });
        const server = new ApolloServer({
            schema,
            plugins: [ApolloServerPluginInlineTraceDisabled()],
        });
        const { url } = await startStandaloneServer(server, {
            listen: { host: '127.0.0.1', port },
        });

        return { url, server };
    }

    const { url, server: initialServer } = await spawnServer();
    currentServer = initialServer;

    async function stopServer() {
        assert(currentServer != null, 'cannot stop server before it has been started');
        currentServer.assertStarted('cannot stop server before it has been started');
        await currentServer.stop();
        currentServer = null;
    }

    async function respawn() {
        await stopServer();
        const { server: newServer } = await spawnServer();
        currentServer = newServer;
    }

    return { url, respawn, stopServer };
}
