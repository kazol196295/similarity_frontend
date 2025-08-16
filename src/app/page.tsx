'use client';

//import taliwind

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Interface, Log } from "ethers";
//import contractJson from "../lib/contract";

import {abi, getReadContract, getWriteContract } from "./lib/contract";

const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_URL as string;

type Status = "Pending" | "Rejected" | "Approved" | "Failed";

function statusName(n: number): Status {
  return ["Pending", "Rejected", "Approved", "Failed"][n] as Status;
}

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<string>("");
  const [username, setUsername] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [postId, setPostId] = useState<bigint | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [cid, setCid] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const iface = useMemo(() => new Interface(abi), []);

  // Connect wallet
  const connect = async () => {
    try {
      const contract = await getWriteContract();
      // get signer address
      const signer = (contract.runner as any);
      const addr = await signer.getAddress();
      setAccount(addr);
      setConnected(true);
    } catch (e: any) {
      alert(e.message ?? "Failed to connect wallet");
    }
  };

  // Submit post flow
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !content.trim()) {
      alert("Username and content are required");
      return;
    }
    setSubmitting(true);
    setStatus("Pending");
    setScore(null);
    setCid(null);
    setPostId(null);

    try {
      // 1) submitPost on-chain
      const contract = await getWriteContract();
      const tx = await contract.submitPost(username.trim());
      const receipt = await tx.wait();

      // 2) parse PostSubmitted(postId, author, username)
      let id: bigint | null = null;
      for (const log of receipt!.logs as Log[]) {
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === "PostSubmitted") {
            id = parsed.args[0] as bigint;
            break;
          }
        } catch {}
      }
      if (!id) throw new Error("PostSubmitted event not found");
      setPostId(id);

      // 3) send content to Oracle
      const walletAddress = (contract.runner as any).address as string;
      const res = await fetch(`${ORACLE_URL}/store-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: id.toString(),
          content: content.trim(),
          username: username.trim(),
          walletAddress
        })
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Oracle rejected content: ${res.status} ${msg}`);
      }

      // 4) start polling the post status
      startPolling(id);

    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Submission failed");
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const startPolling = async (id: bigint) => {
    stopPolling();
    // poll every 5s up to 1 minute (12 tries)
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      const done = await checkStatus(id);
      if (done || attempts >= 12) {
        stopPolling();
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const checkStatus = async (id: bigint) => {
    try {
      const c = getReadContract();
      const post = await c.getPost(id);
      // post.status: 0 Pending, 1 Rejected, 2 Approved, 3 Failed
      const s = Number(post.status);
      const sc = Number(post.similarityScore ?? 0);
      const ipfsCID: string = post.ipfsCID ?? "";
      setStatus(statusName(s));
      setScore(sc);
      setCid(ipfsCID || null);

      return s === 1 || s === 2 || s === 3; // terminal
    } catch (e) {
      console.error("checkStatus error:", e);
      return false;
    }
  };

  // auto-detect existing wallet connection
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      (window as any).ethereum.request({ method: "eth_accounts" }).then((accs: string[]) => {
        if (accs?.length) {
          setAccount(accs[0]);
          setConnected(true);
        }
      }).catch(() => {});
    }
    return () => stopPolling();
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">AdvancedPostManager — Frontend</h1>

      <div className="flex items-center gap-3 mb-6">
        {!connected ? (
          <button
            onClick={connect}
            className="px-4 py-2 rounded-xl shadow border hover:shadow-md"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="text-sm">
            Connected: <span className="font-mono">{account.slice(0,6)}…{account.slice(-4)}</span>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 mb-8">
        <div>
          <label className="block text-sm mb-1">Username</label>
          <input
            className="w-full border rounded-lg p-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. testuser123"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Post Content</label>
          <textarea
            className="w-full border rounded-lg p-2 h-40"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your post..."
            required
          />
        </div>

        <button
          type="submit"
          disabled={!connected || submitting}
          className="px-4 py-2 rounded-xl shadow border hover:shadow-md disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Post"}
        </button>
      </form>

      <div className="space-y-2">
        <div className="text-sm">Post ID: {postId ? postId.toString() : "—"}</div>
        <div className="text-sm">Status: {status ?? "—"}</div>
        <div className="text-sm">Similarity Score: {score ?? "—"}{score != null ? "%" : ""}</div>
        <div className="text-sm">
          IPFS CID: {cid ? (
            <a
              className="underline"
              href={`https://gateway.pinata.cloud/ipfs/${cid}`}
              target="_blank"
              rel="noreferrer"
            >
              {cid}
            </a>
          ) : "—"}
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-6">
        Tip: Keep your oracle service running and funded on Sepolia.
      </p>
    </main>
  );
}
