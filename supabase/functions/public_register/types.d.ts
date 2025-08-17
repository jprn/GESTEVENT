// Minimal shims so IDE stops reporting missing modules while using Deno import maps.
// These are only for editor comfort; the Edge Function runs on Deno with remote modules.

declare const Deno: any;

declare module "std/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "@supabase/supabase-js" {
  export function createClient(url: string, key: string, opts?: any): any;
}

declare module "qrcode" {
  const QRCode: {
    toUint8Array: (text: string, opts?: any) => Promise<Uint8Array>;
  };
  export default QRCode;
}
