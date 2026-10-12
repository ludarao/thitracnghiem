"use client";
import { useEffect, useState } from "react";
import { claimExamTab, type OwnershipStatus } from "../lib/tab-ownership";
export function useExamTab() {
  const [status, setStatus] = useState<OwnershipStatus>("pending");
  const [retry, setRetry] = useState(0);
  useEffect(() => claimExamTab(navigator.locks, setStatus), [retry]);
  return { status, retry: () => setRetry((value) => value + 1) };
}
