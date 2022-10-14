# dagula-gateway

> An IPFS Gateway for Cloudflare Workers that uses Dagula.

![Dagula Gateway Diagram](https://dweb.link/ipfs/bafybeiheilouffa22iufkgebssavr7rkdpuuihu7nf5fsz7vjvoyrn7fky/dagula-gateway.png)

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
    # Monitoring setup - Get from Sentry
    $ wrangler secret put SENTRY_DSN --env DEVELOPER
    ```
4. Publish `wrangler publish --env DEVELOPER`
