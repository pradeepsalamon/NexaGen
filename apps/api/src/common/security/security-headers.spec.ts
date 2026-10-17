import type { Request, Response } from "express";
import { securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  const run = (secure: boolean) => {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      }
    } as unknown as Response;
    const next = jest.fn();
    securityHeaders({ secure } as Request, response, next);
    expect(next).toHaveBeenCalled();
    return headers;
  };

  it("forbids framing and sniffing and never leaks a token-bearing URL", () => {
    expect(run(false)).toEqual({
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    });
  });

  it("adds HSTS only on a request that arrived over https", () => {
    expect(run(true)["Strict-Transport-Security"]).toBe("max-age=31536000");
  });
});
