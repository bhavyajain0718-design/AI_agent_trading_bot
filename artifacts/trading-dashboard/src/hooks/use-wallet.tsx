import { createContext, useContext, useEffect, useMemo, useState } from "react";

type InjectedEthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  providers?: InjectedEthereumProvider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
};

export type WalletOption = {
  id: string;
  name: string;
  provider: InjectedEthereumProvider | null;
  installed: boolean;
};

type WalletContextValue = {
  connectedWallet: string | null;
  selectedWalletId: string | null;
  walletOptions: WalletOption[];
  connectWallet: (walletId: string) => Promise<string>;
  disconnectWallet: () => void;
};

const STORAGE_KEY = "bhavya_trade_wallet_id";

const walletDefinitions = [
  { id: "metamask", name: "MetaMask" },
  { id: "rabby", name: "Rabby" },
  { id: "coinbase", name: "Coinbase Wallet" },
  { id: "brave", name: "Brave Wallet" },
  { id: "injected", name: "Browser Wallet" },
] as const;

const WalletContext = createContext<WalletContextValue | null>(null);

function getEthereumProvider() {
  return (window as Window & { ethereum?: InjectedEthereumProvider }).ethereum;
}

function detectWalletId(provider: InjectedEthereumProvider) {
  if (provider.isRabby) {
    return "rabby";
  }
  if (provider.isCoinbaseWallet) {
    return "coinbase";
  }
  if (provider.isBraveWallet) {
    return "brave";
  }
  if (provider.isMetaMask) {
    return "metamask";
  }
  return "injected";
}

function discoverWalletOptions(): WalletOption[] {
  const providerMap = new Map<string, InjectedEthereumProvider>();
  const rootProvider = getEthereumProvider();
  const providers = rootProvider?.providers?.length ? rootProvider.providers : rootProvider ? [rootProvider] : [];

  for (const provider of providers) {
    const walletId = detectWalletId(provider);
    if (!providerMap.has(walletId)) {
      providerMap.set(walletId, provider);
    }
    if (!providerMap.has("injected")) {
      providerMap.set("injected", provider);
    }
  }

  return walletDefinitions.map((definition) => ({
    ...definition,
    provider: providerMap.get(definition.id) ?? null,
    installed: providerMap.has(definition.id),
  }));
}

async function getAccounts(provider: InjectedEthereumProvider) {
  const accounts = await provider.request({ method: "eth_accounts" });
  return Array.isArray(accounts) ? accounts.filter((value): value is string => typeof value === "string") : [];
}

export function formatWalletAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>(() => discoverWalletOptions());
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    const nextOptions = discoverWalletOptions();
    setWalletOptions(nextOptions);

    const restoreWallet = async () => {
      const preferredOption =
        nextOptions.find((option) => option.id === localStorage.getItem(STORAGE_KEY) && option.provider) ??
        nextOptions.find((option) => option.provider);

      if (!preferredOption?.provider) {
        setConnectedWallet(null);
        return;
      }

      const accounts = await getAccounts(preferredOption.provider);
      const [account] = accounts;
      setConnectedWallet(account ?? null);
      setSelectedWalletId(account ? preferredOption.id : null);

      if (account) {
        localStorage.setItem(STORAGE_KEY, preferredOption.id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    void restoreWallet().catch(() => {
      setConnectedWallet(null);
      setSelectedWalletId(null);
      localStorage.removeItem(STORAGE_KEY);
    });
  }, []);

  const activeOption = useMemo(
    () => walletOptions.find((option) => option.id === selectedWalletId) ?? null,
    [selectedWalletId, walletOptions],
  );

  useEffect(() => {
    const provider = activeOption?.provider;
    if (!provider?.on) {
      return;
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      const [accounts] = args;
      const [account] = Array.isArray(accounts) ? accounts : [];
      if (typeof account === "string" && account.length > 0) {
        setConnectedWallet(account);
      } else {
        setConnectedWallet(null);
        setSelectedWalletId(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [activeOption]);

  const connectWallet = async (walletId: string) => {
    const nextOptions = discoverWalletOptions();
    setWalletOptions(nextOptions);

    const option = nextOptions.find((candidate) => candidate.id === walletId);
    if (!option?.provider) {
      throw new Error(`${option?.name ?? "Wallet"} is not available in this browser.`);
    }

    const accounts = await option.provider.request({ method: "eth_requestAccounts" });
    const [account] = Array.isArray(accounts) ? accounts : [];
    if (typeof account !== "string" || account.length === 0) {
      throw new Error("No wallet account returned.");
    }

    setConnectedWallet(account);
    setSelectedWalletId(option.id);
    localStorage.setItem(STORAGE_KEY, option.id);
    return account;
  };

  const disconnectWallet = () => {
    setConnectedWallet(null);
    setSelectedWalletId(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <WalletContext.Provider
      value={{
        connectedWallet,
        selectedWalletId,
        walletOptions,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
