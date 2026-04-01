const KRAKEN_PUBLIC_URL = "https://api.kraken.com/0/public/AssetPairs";

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";

export async function checkKrakenConnectivity(): Promise<boolean> {
  try {
    const response = await fetch(KRAKEN_PUBLIC_URL, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return Array.isArray(payload?.error) && payload.error.length === 0;
  } catch {
    return false;
  }
}

export async function checkRpcConnectivity(rpcUrl = process.env["RPC_URL"] ?? DEFAULT_RPC_URL): Promise<boolean> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return typeof payload?.result === "string" && payload.result.length > 0;
  } catch {
    return false;
  }
}
