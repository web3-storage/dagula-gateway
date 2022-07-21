# dagula-gateway

> An IPFS Gateway for Cloudflare Workers that uses Dagula.

## Local setup

1. Copy `.env.tpl` file into `.env` and fill in environment variables
2. Run `npm run dev` to start worker within Miniflare

## Clouflare setup

1. Add your env section to `wrangler.toml`
2. Dev `wrangler dev --env DEVELOPER`
3. Set secrets:
    ```console
    # multiaddr (with peer ID) of peer to transfer from
    $ wrangler secret put REMOTE_PEER --env DEVELOPER
    ```
4. Publish `wrangler publish --env DEVELOPER`
