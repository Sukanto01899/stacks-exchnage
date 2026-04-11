export const buildExplorerTxUrl = (txid: string, chain: string) => {
  return `https://explorer.hiro.so/txid/${txid}?chain=${chain}`;
};

export const buildExplorerAddressUrl = (address: string, chain: string) => {
  return `https://explorer.hiro.so/address/${address}?chain=${chain}`;
};

