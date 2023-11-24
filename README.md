# FancyIntrospectAndCompose

A fancier version of Apollo's `IntrospectAndCompose` (from `@apollo/gateway`).

Adds the following features:

-   **Modify the schema after composition.** (Useful for adding gateway-only directives)
-   **Provide static subgraphs.** (Useful for short-circuiting introspection requests to subgraphs that will not change)

## Install

```bash
$ yarn add fancy-introspect-and-compose
```

## Example Usage

```js
new ApolloGateway({
    supergraphSdl: new FancyIntrospectAndCompose({
        pollIntervalInMs: 1000,
        modifySchema: sdl => {
            return `directive @MyNewDirective on QUERY\n${sdl}`;
        },
        subgraphs: [
            {
                name: 'subgraph_foo',
                url: 'http://foo.mesh.example.com/graphql',
            },
        ],
        staticSubgraphs: [
            {
                name: 'subgraph_bar',
                sdl: fs.readFileSync('/path/to/bar.graphql'),
            },
        ],
    }),
});
```

_See the [tests](tests/index.test.ts) for more._

## API

`FancyIntrospectAndCompose` extends `IntrospectAndCompose`. It has the same methods and accepts the same constructor options:

https://www.apollographql.com/docs/apollo-server/using-federation/api/apollo-gateway/#options-2

### Additional Options

`FancyIntrospectAndCompose` accepts the following additional constructor options:

| parameter         | type                                                            | description                                                     |
| ----------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `modifySchema`    | `(sdl: string) => string`                                       | a callback to modify the composed schema                        |
| `staticSubgraphs` | `Array<{ name: string, sdl: string \| () => Promise<string> }>` | a list of subgraphs + static sdl (will not be polled/refetched) |
