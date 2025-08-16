import raw from "../../../lib/abi/AdvancedPostManager.json";
import { BrowserProvider, JsonRpcProvider, Contract, InterfaceAbi } from "ethers";

// Accept both: plain ABI array OR artifact with { abi }
function toAbi(x: unknown): InterfaceAbi {
  if (Array.isArray(x)) return x as InterfaceAbi;                // Case A
  if (x && typeof x === "object" && "abi" in (x as any)) {
    return (x as { abi: InterfaceAbi }).abi;                     // Case B
  }
  throw new Error("Invalid ABI JSON: expected an ABI array or an object with { abi }");
}

export const abi: InterfaceAbi = toAbi(raw);

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as string;
export const RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL as string;

if (!CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS missing");
if (!RPC_URL) throw new Error("NEXT_PUBLIC_SEPOLIA_RPC_URL missing");

export function getReadContract() {
  const provider = new JsonRpcProvider(RPC_URL);
  return new Contract(CONTRACT_ADDRESS, abi, provider);
}

export async function getWriteContract() {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("Wallet not found. Please install MetaMask.");
  }
  const provider = new BrowserProvider((window as any).ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, abi, signer);
}
