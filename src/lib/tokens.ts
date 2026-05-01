import { createCommercialClient } from "@/lib/supabase/server";

export type BotPricing = {
  model: string;
  in_per_mtok: number;
  out_per_mtok: number;
};

export type TokenPricing = {
  bots: Record<string, BotPricing>;
  usd_to_cop: number | null;
};

const DEFAULT: TokenPricing = {
  bots: {
    default: { model: "claude-sonnet-4-6", in_per_mtok: 3.0, out_per_mtok: 15.0 },
  },
  usd_to_cop: null,
};

export async function getTokenPricing(): Promise<TokenPricing> {
  try {
    const supabase = await createCommercialClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "token_pricing")
      .maybeSingle();
    return ((data?.value as TokenPricing) || DEFAULT) as TokenPricing;
  } catch {
    return DEFAULT;
  }
}

export function pricingFor(pricing: TokenPricing, bot: string): BotPricing {
  return pricing.bots[bot] || pricing.bots.default || DEFAULT.bots.default;
}

export function costUsd(input: number, output: number, p: BotPricing): number {
  return (input / 1_000_000) * p.in_per_mtok + (output / 1_000_000) * p.out_per_mtok;
}
