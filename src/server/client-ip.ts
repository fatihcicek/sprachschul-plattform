import { headers } from "next/headers";
import { clientIpFrom } from "@/domain/registration";

/** IP der anfragenden Person hinter dem vertrauenswürdigen Proxy (TRUSTED_PROXY_HOPS, Standard 1). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  return clientIpFrom(h.get("x-forwarded-for") ?? h.get("x-real-ip"), Number.isInteger(hops) && hops > 0 ? hops : 1);
}
