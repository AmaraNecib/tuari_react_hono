import { createMiddleware } from "hono/factory";

/**
 * Options for {@link createOriginBlockingMiddleware}.
 */
export type OriginBlockingOptions = {
  /**
   * When true, request WITHOUT an Origin header using safe methods (GET/HEAD)
   * are allowed through — top-level browser navigation and health checks do
   * not send a CSRF-relevant Origin. State-changing originless requests are
   * still blocked. Defaults to false (fail closed).
   */
  allowOriginlessSafelist?: boolean;
};

/**
 * Collapse of the duplicated per-prefix origin blocks in `create-app.ts`
 * (`/api/auth/*`, `/rpc/*`, `/api/inventory/*`).
 *
 * Every request carrying an Origin header must come from an allow-listed
 * origin; requests without one fail closed unless `allowOriginlessSafelist`
 * exempts safe (GET/HEAD) navigation.
 */
export function createOriginBlockingMiddleware(
  isAllowedOrigin: (origin: string | undefined) => boolean,
  options: OriginBlockingOptions = {},
) {
  return createMiddleware(async (c, next) => {
    const origin = c.req.header("origin");
    const isTopLevelSafeRequest =
      options.allowOriginlessSafelist === true &&
      !origin &&
      ["GET", "HEAD"].includes(c.req.method);

    if (!isTopLevelSafeRequest && !isAllowedOrigin(origin)) {
      return c.json({ message: "Blocked origin." }, 403);
    }

    await next();
  });
}
