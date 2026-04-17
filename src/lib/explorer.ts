export const buildExplorerTxUrl = (txid: string, chain: string) => {
  return `https://explorer.hiro.so/txid/${txid}?chain=${chain}`;
};

export const buildExplorerAddressUrl = (address: string, chain: string) => {
  return `https://explorer.hiro.so/address/${address}?chain=${chain}`;
};

export const buildExplorerContractUrl = (contractId: string, chain: string) => {
  const [address = "", name = ""] = String(contractId || "").split(".");
  if (!address || !name) return null;
  return `https://explorer.hiro.so/contract/${address}/${name}?chain=${chain}`;
};
